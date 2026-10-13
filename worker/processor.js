"use strict";

const { Worker } = require("bullmq");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { getSetting } = require("./utils/settings");

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);
const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, "..", "storage");
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "2", 10);

const connection = { host: REDIS_HOST, port: REDIS_PORT };

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// Ensure storage dirs
for (const dir of ["videos", "frames", "transcripts", "results"]) {
  fs.mkdirSync(path.join(STORAGE_PATH, dir), { recursive: true });
}

function execPromise(cmd, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const proc = exec(cmd, { maxBuffer: 50 * 1024 * 1024, timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Command failed: ${cmd}\n${stderr || err.message}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

async function probeDurationSeconds(filePath) {
  const out = await execPromise(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${shellEscape(filePath)}`
  );
  const duration = parseFloat(out.trim());
  return Number.isFinite(duration) ? duration : null;
}

async function processResizeVideo(job) {
  const { jobId, source, options = {} } = job.data;

  if (!source || source.type !== "url" || !source.value) {
    throw new Error("Invalid resize source. Expected { type: 'url', value: 'https://...' }");
  }

  const videoDir = path.join(STORAGE_PATH, "videos", jobId);
  const resultPath = path.join(STORAGE_PATH, "results", `${jobId}.json`);
  const sourcePath = path.join(videoDir, "source_input.mp4");
  fs.mkdirSync(videoDir, { recursive: true });

  const outputName = String(options.outputName || "compressed.mp4").replace(/[^a-zA-Z0-9._-]/g, "_");
  const safeOutputName = outputName.toLowerCase().endsWith(".mp4") ? outputName : `${outputName}.mp4`;
  const outputPath = path.join(videoDir, safeOutputName);

  const width = Number.isFinite(options.width) ? options.width : null;
  const height = Number.isFinite(options.height) ? options.height : null;
  const fps = Number.isFinite(options.fps) ? options.fps : null;
  const crf = Number.isFinite(options.crf) ? options.crf : 28;
  const preset = options.preset || "medium";
  const videoBitrate = options.videoBitrate ? String(options.videoBitrate) : null;
  const audioBitrate = options.audioBitrate ? String(options.audioBitrate) : "128k";

  let scaleFilter = null;
  if (width && height) {
    scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease`;
  } else if (width) {
    scaleFilter = `scale=${width}:-2`;
  } else if (height) {
    scaleFilter = `scale=-2:${height}`;
  }

  const vfParts = [];
  if (scaleFilter) vfParts.push(scaleFilter);
  if (fps) vfParts.push(`fps=${fps}`);
  const vfArg = vfParts.length ? `-vf ${shellEscape(vfParts.join(","))}` : "";
  const bitrateArg = videoBitrate ? `-b:v ${shellEscape(videoBitrate)}` : "";

  try {
    await job.updateProgress(5);
    job.log("Downloading source video...");

    const downloadCmd = [
      "curl -L --fail --retry 3 --retry-delay 2 --retry-connrefused",
      "--connect-timeout 20 --max-time 1200",
      `-o ${shellEscape(sourcePath)}`,
      shellEscape(source.value),
    ].join(" ");

    await execPromise(downloadCmd, 1300000);

    if (!fs.existsSync(sourcePath) || fs.statSync(sourcePath).size <= 0) {
      throw new Error("Downloaded source video is empty or missing");
    }

    // Validate source media after download so partial upstream content fails early.
    await execPromise(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${shellEscape(sourcePath)}`);

    await job.updateProgress(20);
    job.log("Starting video compression...");

    const cmd = [
      "ffmpeg -y",
      "-analyzeduration 20M",
      "-probesize 20M",
      `-i ${shellEscape(sourcePath)}`,
      vfArg,
      "-c:v libx264",
      `-preset ${shellEscape(preset)}`,
      `-crf ${shellEscape(crf)}`,
      bitrateArg,
      "-movflags +faststart",
      "-c:a aac",
      `-b:a ${shellEscape(audioBitrate)}`,
      `${shellEscape(outputPath)}`,
      "-loglevel warning",
    ].filter(Boolean).join(" ");

    await execPromise(cmd, 1800000);
    await job.updateProgress(80);

    if (!fs.existsSync(outputPath)) {
      throw new Error("Compression finished but output file was not created");
    }

    const stats = fs.statSync(outputPath);
    if (stats.size <= 0) {
      throw new Error("Compression output is empty");
    }

    const duration = await probeDurationSeconds(outputPath);

    const result = {
      jobId,
      type: "resize-video",
      sourceUrl: source.value,
      output: {
        filename: safeOutputName,
        sizeBytes: stats.size,
        durationSeconds: duration,
        videoUrl: `/api/jobs/${jobId}/download`,
      },
      settings: {
        width,
        height,
        fps,
        crf,
        preset,
        videoBitrate,
        audioBitrate,
      },
      processedAt: new Date().toISOString(),
    };

    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

    await job.updateProgress(100);
    return result;
  } catch (err) {
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size <= 0) {
      fs.rmSync(outputPath, { force: true });
    }
    throw err;
  } finally {
    if (fs.existsSync(sourcePath)) {
      fs.rmSync(sourcePath, { force: true });
    }
  }
}

async function processVideo(job) {
  const { jobId, videoPath, options = {} } = job.data;

  const framesDir = path.join(STORAGE_PATH, "frames", jobId);
  const transcriptPath = path.join(STORAGE_PATH, "transcripts", `${jobId}.json`);
  const resultPath = path.join(STORAGE_PATH, "results", `${jobId}.json`);

  const fps = options.framesPerSecond || getSetting("video_frames_per_second") || "1";
  const maxFrames = options.maxFrames || getSetting("video_max_frames") || "30";
  const whisperModel = options.whisperModel || getSetting("video_whisper_model") || "base";
  const aiProvider = options.aiProvider || getSetting("video_ai_provider") || "openai";
  const skipAI = options.skipAI === true || options.skipAI === "true";
  const shouldCleanup = options.cleanup !== undefined
    ? (options.cleanup === true || options.cleanup === "true")
    : (getSetting("video_cleanup_after_processing") !== "false");

  try {
    // Validate video exists
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    // Step 1: Extract frames (20%)
    await job.updateProgress(5);
    job.log("Extracting frames...");

    fs.mkdirSync(framesDir, { recursive: true });
    const extractScript = path.join(__dirname, "..", "scripts", "extract_frames.sh");
    await execPromise(`bash "${extractScript}" "${videoPath}" "${framesDir}" "${fps}" "${maxFrames}"`);

    const frames = fs.readdirSync(framesDir)
      .filter((f) => f.endsWith(".jpg"))
      .sort();
    job.log(`Extracted ${frames.length} frames`);
    await job.updateProgress(20);

    // Step 2: Transcribe (60%)
    let transcript = [];
    if (skipAI) {
      job.log("skipAI=true — skipping audio transcription");
    } else {
      job.log("Checking for audio stream...");
      const hasAudio = await execPromise(
        `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${videoPath}"`
      ).then((out) => out.trim() === "audio").catch(() => false);

      if (hasAudio) {
        job.log("Transcribing audio...");
        try {
          const transcribeScript = path.join(__dirname, "..", "python", "transcribe.py");
          const transcriptRaw = await execPromise(
            `python3 "${transcribeScript}" "${videoPath}" "${whisperModel}"`,
            600000
          );

          // Extract JSON from output (last line is the JSON)
          const lines = transcriptRaw.split("\n");
          let transcriptJson = "[]";
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith("[")) {
              transcriptJson = line;
              break;
            }
          }
          transcript = JSON.parse(transcriptJson);
          job.log(`Transcription complete: ${transcript.length} segments`);
        } catch (tErr) {
          job.log(`Transcription skipped or failed: ${tErr.message}`);
          transcript = [];
        }
      } else {
        job.log("No audio stream detected — skipping transcription");
      }
    }

    fs.writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2));
    await job.updateProgress(60);

    // Step 3: Generate AI metadata (90%) — skipped if skipAI=true
    let metadata = null;

    if (skipAI) {
      job.log("skipAI=true — skipping AI metadata generation");
      await job.updateProgress(90);
    } else {
      job.log(`Generating metadata via ${aiProvider}...`);
      const { generateMetadata } = require("../services/ai");
      metadata = await generateMetadata({
        framesDir,
        frames,
        transcript,
        aiProvider,
      });
      await job.updateProgress(90);
    }

    // Step 4: Save result
    const result = {
      jobId,
      metadata,
      skipAI: skipAI || false,
      videoUrl: `/api/jobs/${jobId}/download`,
      videoPath,
      transcript: {
        segments: transcript.length,
        fullText: transcript.map((s) => s.text).join(" "),
      },
      framesExtracted: frames.length,
      processedAt: new Date().toISOString(),
    };

    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
    job.log("Result saved");

    // Step 5: Cleanup
    if (shouldCleanup) {
      job.log("Cleaning up frames...");
      fs.rmSync(framesDir, { recursive: true, force: true });
    }

    await job.updateProgress(100);
    return result;
  } catch (err) {
    // Cleanup on failure too
    if (shouldCleanup && fs.existsSync(framesDir)) {
      fs.rmSync(framesDir, { recursive: true, force: true });
    }
    throw err;
  }
}

const worker = new Worker("video-processing", async (job) => {
  if (job.name === "resize-video") {
    return processResizeVideo(job);
  }
  return processVideo(job);
}, {
  connection,
  concurrency: CONCURRENCY,
  limiter: {
    max: CONCURRENCY,
    duration: 1000,
  },
});

worker.on("completed", (job) => {
  console.log(`[DONE] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[FAIL] Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("[WORKER ERROR]", err.message);
});

console.log(`Media Studio Worker started (concurrency=${CONCURRENCY})`);

// Start image processor
require("./imageProcessor");
