"use strict";

const path = require("path");
const fs = require("fs");
const { videoQueue } = require("../queue");
const { Queue } = require("bullmq");
const getDb = require("../db");

const imageQueue = new Queue("image-processing", {
  connection: {
    host: process.env.REDIS_HOST || "redis",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
  },
});

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, "..", "..", "storage");

async function jobRoutes(app) {
  // Get job status
  app.get("/jobs/:jobId", {
    schema: {
      tags: ["jobs"],
      summary: "Get job status",
      description: "Returns current state, progress, and result (when completed) for a job.",
      params: { type: "object", properties: { jobId: { type: "string", description: "Job ID returned by upload or images-to-video" } }, required: ["jobId"] },
      response: {
        200: {
          type: "object",
          properties: {
            jobId: { type: "string" },
            state: { type: "string", enum: ["waiting", "active", "delayed", "completed", "failed"] },
            progress: { type: "number", minimum: 0, maximum: 100 },
            data: { type: "object" },
            timestamps: { type: "object" },
            result: { type: "object", nullable: true },
            error: { type: "string", nullable: true },
          },
        },
        404: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (req, reply) => {
    const { jobId } = req.params;
    const job = await videoQueue.getJob(jobId);

    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }

    const state = await job.getState();
    const progress = job.progress || 0;

    const response = {
      jobId: job.id,
      state,
      progress,
      data: {
        originalName: job.data.originalName,
        fileSize: job.data.fileSize,
      },
      timestamps: {
        created: new Date(job.timestamp).toISOString(),
        processed: job.processedOn
          ? new Date(job.processedOn).toISOString()
          : null,
        finished: job.finishedOn
          ? new Date(job.finishedOn).toISOString()
          : null,
      },
    };

    if (state === "completed" && job.returnvalue) {
      response.result = job.returnvalue;
    }

    if (state === "failed") {
      response.error = job.failedReason;
    }

    return response;
  });

  // Get job result
  app.get("/jobs/:jobId/result", {
    schema: {
      tags: ["jobs"],
      summary: "Get AI-generated metadata result",
      description: "Returns job result JSON for completed jobs (AI metadata for normal jobs, or resize output metadata for resize jobs). Returns 404 when no persisted result exists (for failed/incomplete jobs).",
      params: { type: "object", properties: { jobId: { type: "string" } }, required: ["jobId"] },
      response: {
        404: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (req, reply) => {
    const { jobId } = req.params;

    const resultPath = path.join(STORAGE_PATH, "results", `${jobId}.json`);
    if (!fs.existsSync(resultPath)) {
      return reply.code(404).send({ error: "Result not found" });
    }

    const result = JSON.parse(fs.readFileSync(resultPath, "utf-8"));

    // Add video download URL if the video file exists
    const videoDir = path.join(STORAGE_PATH, "videos", jobId);
    const flatVideo1 = path.join(STORAGE_PATH, "videos", `${jobId}_slideshow.mp4`);
    const flatVideo2 = path.join(STORAGE_PATH, "videos", `${jobId}.mp4`);
    const flatVideo3 = path.join(STORAGE_PATH, "videos", `slideshow_${jobId}.mp4`);

    if (fs.existsSync(videoDir)) {
      const files = fs.readdirSync(videoDir).filter(f => f.endsWith(".mp4"));
      if (files.length > 0) {
        result.videoUrl = `/api/jobs/${jobId}/download`;
      }
    } else if (fs.existsSync(flatVideo1) || fs.existsSync(flatVideo2) || fs.existsSync(flatVideo3)) {
      result.videoUrl = `/api/jobs/${jobId}/download`;
    } else {
      // Fallback: always expose the standard download endpoint for completed video jobs
      result.videoUrl = `/api/jobs/${jobId}/download`;
    }

    return result;
  });

  // Download video file
  app.get("/jobs/:jobId/download", {
    schema: {
      tags: ["jobs"],
      summary: "Download video file",
      description: "Downloads a generated or uploaded MP4 file. Returns 400 for invalid job ID format or empty/incomplete output files; returns 404 when no video is present.",
      params: { type: "object", properties: { jobId: { type: "string" } }, required: ["jobId"] },
      response: {
        400: { type: "object", properties: { error: { type: "string" } } },
        404: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (req, reply) => {
    const { jobId } = req.params;

    // Validate jobId format (UUID only)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
      return reply.code(400).send({ error: "Invalid job ID format" });
    }

    const videoDir = path.join(STORAGE_PATH, "videos", jobId);
    let videoFile = null;
    let filename = `slideshow_${jobId}.mp4`;

    if (fs.existsSync(videoDir)) {
      const files = fs.readdirSync(videoDir).filter(f => f.endsWith(".mp4"));
      if (files.length > 0) {
        videoFile = path.join(videoDir, files[0]);
        filename = files[0];
      }
    }

    if (!videoFile) {
      const flatCandidates = [
        path.join(STORAGE_PATH, "videos", `${jobId}_slideshow.mp4`),
        path.join(STORAGE_PATH, "videos", `slideshow_${jobId}.mp4`),
        path.join(STORAGE_PATH, "videos", `${jobId}.mp4`),
      ];
      for (const cand of flatCandidates) {
        if (fs.existsSync(cand)) {
          videoFile = cand;
          filename = path.basename(cand);
          break;
        }
      }
    }

    if (!videoFile || !fs.existsSync(videoFile)) {
      return reply.code(404).send({ error: "Video not found" });
    }

    const stat = fs.statSync(videoFile);
    if (stat.size <= 0) {
      return reply.code(400).send({ error: "Video file is empty or incomplete" });
    }

    const isDownload = req.query.download === "true" || req.query.download === "1";
    reply.header("Content-Type", "video/mp4");
    reply.header("Accept-Ranges", "bytes");

    if (isDownload) {
      reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    } else {
      reply.header("Content-Disposition", `inline; filename="${filename}"`);
    }

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = (end - start) + 1;
      reply.code(206);
      reply.header("Content-Range", `bytes ${start}-${end}/${stat.size}`);
      reply.header("Content-Length", chunksize);
      return reply.send(fs.createReadStream(videoFile, { start, end }));
    }

    reply.header("Content-Length", stat.size);
    return reply.send(fs.createReadStream(videoFile));
  });

  // Get job transcript
  app.get("/jobs/:jobId/transcript", {
    schema: {
      tags: ["jobs"],
      summary: "Get transcript segments",
      description: "Returns an array of timestamped transcript segments from Whisper transcription.",
      params: { type: "object", properties: { jobId: { type: "string" } }, required: ["jobId"] },
      response: {
        200: {
          type: "array",
          items: {
            type: "object",
            properties: {
              start: { type: "number", description: "Segment start time in seconds" },
              end: { type: "number", description: "Segment end time in seconds" },
              text: { type: "string" },
            },
          },
        },
        404: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (req, reply) => {
    const { jobId } = req.params;

    const transcriptPath = path.join(STORAGE_PATH, "transcripts", `${jobId}.json`);
    if (!fs.existsSync(transcriptPath)) {
      return reply.code(404).send({ error: "Transcript not found" });
    }

    const transcript = JSON.parse(fs.readFileSync(transcriptPath, "utf-8"));
    return transcript;
  });

  // Get raw extracted data — transcript segments + frames — no AI metadata
  app.get("/jobs/:jobId/raw", {
    schema: {
      tags: ["jobs"],
      summary: "Get raw extracted data (no AI)",
      description: "Returns transcript segments and frame file info without any AI-generated content. Use this when you want to process the raw data yourself, or when skipAI=true was set on upload.",
      params: { type: "object", properties: { jobId: { type: "string" } }, required: ["jobId"] },
      response: {
        200: {
          type: "object",
          properties: {
            jobId: { type: "string" },
            video: { type: "object", properties: { originalName: { type: "string", nullable: true }, fileSize: { type: "number", nullable: true } } },
            transcript: {
              type: "object",
              properties: {
                segments: { type: "array", items: { type: "object" } },
                segmentCount: { type: "number" },
                fullText: { type: "string", nullable: true },
                hasAudio: { type: "boolean" },
              },
            },
            frames: {
              type: "object",
              properties: {
                count: { type: "number" },
                files: { type: "array", items: { type: "string" } },
                available: { type: "boolean" },
                note: { type: "string", nullable: true },
              },
            },
            processedAt: { type: "string", format: "date-time" },
          },
        },
        400: { type: "object", properties: { error: { type: "string" }, state: { type: "string" } } },
        404: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (req, reply) => {
    const { jobId } = req.params;
    const job = await videoQueue.getJob(jobId);

    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }

    const state = await job.getState();
    if (state !== "completed") {
      return reply.code(400).send({ error: "Job not completed yet", state });
    }

    // Transcript
    const transcriptPath = path.join(STORAGE_PATH, "transcripts", `${jobId}.json`);
    let transcript = [];
    if (fs.existsSync(transcriptPath)) {
      transcript = JSON.parse(fs.readFileSync(transcriptPath, "utf-8"));
    }

    const fullText = transcript.map((s) => s.text).join(" ").trim();

    // Frames
    const framesDir = path.join(STORAGE_PATH, "frames", jobId);
    let frameFiles = [];
    let framesAvailable = false;
    if (fs.existsSync(framesDir)) {
      frameFiles = fs.readdirSync(framesDir)
        .filter((f) => f.endsWith(".jpg"))
        .sort();
      framesAvailable = frameFiles.length > 0;
    }

    return {
      jobId,
      video: {
        originalName: job.data.originalName || null,
        fileSize: job.data.fileSize || null,
      },
      transcript: {
        segments: transcript,
        segmentCount: transcript.length,
        fullText: fullText || null,
        hasAudio: transcript.length > 0,
      },
      frames: {
        count: framesAvailable ? frameFiles.length : (job.returnvalue?.framesExtracted || 0),
        files: frameFiles,
        available: framesAvailable,
        note: !framesAvailable ? "Frames were cleaned up after processing (CLEANUP_AFTER_PROCESSING=true)" : null,
      },
      processedAt: job.returnvalue?.processedAt || new Date(job.finishedOn).toISOString(),
    };
  });

  // List recent jobs
  app.get("/jobs", {
    schema: {
      tags: ["jobs"],
      summary: "List all jobs",
      description: "Returns counts and recent jobs across all states (waiting, active, completed, failed).",
      response: {
        200: {
          type: "object",
          properties: {
            counts: { type: "object", properties: { waiting: { type: "number" }, active: { type: "number" }, completed: { type: "number" }, failed: { type: "number" } } },
            jobs: { type: "array", items: { type: "object", properties: { jobId: { type: "string" }, state: { type: "string" }, originalName: { type: "string" }, progress: { type: "number" }, created: { type: "string" } } } },
          },
        },
      },
    },
  }, async (req, reply) => {
    const [waiting, active, completed, failed] = await Promise.all([
      videoQueue.getWaiting(0, 20),
      videoQueue.getActive(0, 20),
      videoQueue.getCompleted(0, 20),
      videoQueue.getFailed(0, 20),
    ]);

    const formatJob = (job, state) => ({
      jobId: job.id,
      state,
      originalName: job.data.originalName,
      progress: job.progress || 0,
      created: new Date(job.timestamp).toISOString(),
    });

    return {
      counts: {
        waiting: await videoQueue.getWaitingCount(),
        active: await videoQueue.getActiveCount(),
        completed: await videoQueue.getCompletedCount(),
        failed: await videoQueue.getFailedCount(),
      },
      jobs: [
        ...active.map((j) => formatJob(j, "active")),
        ...waiting.map((j) => formatJob(j, "waiting")),
        ...completed.map((j) => formatJob(j, "completed")),
        ...failed.map((j) => formatJob(j, "failed")),
      ],
    };
  });

  // Retry failed job
  app.post("/jobs/:jobId/retry", {
    schema: {
      tags: ["jobs"],
      summary: "Retry a failed job",
      description: "Re-queues a job that is in the 'failed' state.",
      params: { type: "object", properties: { jobId: { type: "string" } }, required: ["jobId"] },
      response: {
        200: { type: "object", properties: { message: { type: "string" }, jobId: { type: "string" } } },
        400: { type: "object", properties: { error: { type: "string" } } },
        404: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (req, reply) => {
    const { jobId } = req.params;
    const job = await videoQueue.getJob(jobId);

    if (!job) {
      // Check if it is an image job in SQLite
      const db = getDb();
      const imgJob = db.prepare("SELECT * FROM image_jobs WHERE id = ?").get(jobId);
      if (!imgJob) {
        return reply.code(404).send({ error: "Job not found" });
      }

      if (imgJob.status !== "failed") {
        return reply.code(400).send({ error: `Only failed jobs can be retried (current status: ${imgJob.status})` });
      }

      const opType = imgJob.operation_type || "edit";
      if (opType !== "generate" && imgJob.original_path && !fs.existsSync(imgJob.original_path)) {
        return reply.code(400).send({ error: "Original source file no longer exists on disk" });
      }

      const jobData = {
        jobId: imgJob.id,
        batchId: imgJob.batch_id || imgJob.id,
        originalPath: imgJob.original_path || null,
        aiProvider: imgJob.ai_provider || "openai",
        prompt: imgJob.prompt || "",
        model: imgJob.model || "gpt-image-2",
        imageSize: imgJob.image_size || "1024x1024",
        outputFormat: imgJob.output_format || "webp",
        quality: imgJob.quality || "high",
        imageCount: imgJob.image_count || 1,
        operationType: opType,
        processingMode: imgJob.processing_mode || null,
        applyLogo: true,
        imaginaryCompressionLevel: null,
        imaginaryResize: null,
        imaginaryResizeBehavior: null,
        useAgentBrain: false,
      };

      db.prepare(`
        UPDATE image_jobs
        SET status = 'waiting', error = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(imgJob.id);

      try {
        await imageQueue.add("edit-image", jobData);
      } catch (err) {
        db.prepare(`
          UPDATE image_jobs
          SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(`Failed to enqueue retry: ${err.message}`, imgJob.id);
        return reply.code(500).send({ error: `Failed to enqueue retry: ${err.message}` });
      }

      return { message: "Job retried", jobId };
    }

    const state = await job.getState();
    if (state !== "failed") {
      return reply.code(400).send({ error: "Only failed jobs can be retried" });
    }

    await job.retry();
    return { message: "Job retried", jobId };
  });
}

module.exports = jobRoutes;
