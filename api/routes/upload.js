"use strict";

const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const { videoQueue } = require("../queue");
const { verifyAuth } = require("../middleware/auth");

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, "..", "..", "storage");
const ALLOWED_EXTENSIONS = new Set([".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".wmv", ".m4v"]);
const MAX_FILENAME_LENGTH = 200;

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, MAX_FILENAME_LENGTH);
}

async function uploadRoutes(app) {
  // Upload video file (Authenticated & Streamed directly to disk)
  app.post("/upload", {
    preHandler: [verifyAuth],
    schema: {
      tags: ["video"],
      summary: "Upload a video file",
      description: "Upload an .mp4/.mkv/.mov/etc file. The video is queued for frame extraction, Whisper transcription, and AI metadata generation. Use `skipAI=true` to extract frames + transcript only.",
      consumes: ["multipart/form-data"],
      body: {
        type: "object",
        properties: {
          file: { type: "string", format: "binary", description: "Video file (.mp4, .mkv, .webm, .avi, .mov, .flv, .wmv, .m4v)" },
          skipAI: { type: "string", description: "Set to 'true' to skip AI metadata generation" },
          whisperModel: { type: "string", description: "Overrides WHISPER_MODEL for this job (tiny|base|small|medium)" },
          framesPerSecond: { type: "string", description: "Frames extracted per second (0.1–5)" },
          maxFrames: { type: "string", description: "Cap on total frames sent to AI (1–100)" },
          aiProvider: { type: "string", description: "Overrides AI_PROVIDER for this job (openai|bedrock)" },
        },
      },
      response: {
        202: {
          type: "object",
          properties: {
            jobId: { type: "string" },
            message: { type: "string" },
            originalName: { type: "string" },
            fileSize: { type: "number" },
            skipAI: { type: "boolean" },
          },
        },
        400: { type: "object", properties: { error: { type: "string" } } },
      },
    },
    validatorCompiler: () => () => true, // disable body validation for multipart
  }, async (req, reply) => {
    const parts = req.parts();
    const jobId = randomUUID();
    const videoDir = path.join(STORAGE_PATH, "videos", jobId);

    let savedFilename = null;
    let savedVideoPath = null;
    let skipAI = false;
    let whisperModel, framesPerSecond, maxFrames, aiProvider;

    try {
      for await (const part of parts) {
        if (part.type === "file") {
          const originalName = part.filename || "upload.mp4";
          const ext = path.extname(originalName).toLowerCase();

          if (!ALLOWED_EXTENSIONS.has(ext)) {
            // Drain remaining stream
            part.file.resume();
            return reply.code(400).send({
              error: `Invalid file type: ${ext}. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
            });
          }

          savedFilename = originalName;
          const safeName = sanitizeFilename(originalName);
          fs.mkdirSync(videoDir, { recursive: true });
          savedVideoPath = path.join(videoDir, safeName);

          // Stream directly to disk to prevent memory exhaustion (OOM)
          await new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(savedVideoPath);
            part.file.pipe(writeStream);
            writeStream.on("finish", resolve);
            writeStream.on("error", (err) => {
              if (fs.existsSync(savedVideoPath)) {
                try { fs.unlinkSync(savedVideoPath); } catch (_) {}
              }
              reject(err);
            });
            part.file.on("error", (err) => {
              if (fs.existsSync(savedVideoPath)) {
                try { fs.unlinkSync(savedVideoPath); } catch (_) {}
              }
              reject(err);
            });
          });
        } else {
          if (part.fieldname === "skipAI") skipAI = part.value === "true" || part.value === "1";
          if (part.fieldname === "whisperModel") whisperModel = part.value;
          if (part.fieldname === "framesPerSecond") framesPerSecond = parseFloat(part.value);
          if (part.fieldname === "maxFrames") maxFrames = parseInt(part.value, 10);
          if (part.fieldname === "aiProvider") aiProvider = part.value;
        }
      }
    } catch (streamErr) {
      if (savedVideoPath && fs.existsSync(savedVideoPath)) {
        try { fs.unlinkSync(savedVideoPath); } catch (_) {}
      }
      return reply.code(500).send({ error: `File stream error: ${streamErr.message}` });
    }

    if (!savedVideoPath || !fs.existsSync(savedVideoPath)) {
      return reply.code(400).send({ error: "No video file uploaded" });
    }

    const stats = fs.statSync(savedVideoPath);
    if (stats.size === 0) {
      try { fs.unlinkSync(savedVideoPath); } catch (_) {}
      return reply.code(400).send({ error: "Uploaded file is empty" });
    }

    let job;
    try {
      job = await videoQueue.add(
        "process-video",
        {
          jobId,
          videoPath: savedVideoPath,
          originalName: savedFilename,
          fileSize: stats.size,
          options: {
            skipAI,
            ...(whisperModel && { whisperModel }),
            ...(framesPerSecond && { framesPerSecond }),
            ...(maxFrames && { maxFrames }),
            ...(aiProvider && { aiProvider }),
          },
        },
        { jobId }
      );
    } catch (queueErr) {
      if (fs.existsSync(savedVideoPath)) {
        try { fs.unlinkSync(savedVideoPath); } catch (_) {}
      }
      return reply.code(500).send({ error: `Failed to enqueue video processing job: ${queueErr.message}` });
    }

    return reply.code(202).send({
      jobId: job.id,
      message: skipAI
        ? "Video uploaded and queued for processing (AI metadata generation skipped)"
        : "Video uploaded and queued for processing",
      originalName: savedFilename,
      fileSize: stats.size,
      skipAI,
    });
  });

  // Process a video already on the server filesystem (Authenticated & Path Restricted)
  app.post("/process", {
    preHandler: [verifyAuth],
    schema: {
      tags: ["video"],
      summary: "Process a file already on the server",
      description: "Queue a video file that already exists inside the container's storage path. Path must reside within /app/storage/videos/.",
      body: {
        type: "object",
        required: ["videoPath"],
        properties: {
          videoPath: { type: "string", description: "Path inside the container storage, e.g. /app/storage/videos/jobId/video.mp4" },
          options: {
            type: "object",
            properties: {
              whisperModel: { type: "string", enum: ["tiny", "base", "small", "medium"] },
              framesPerSecond: { type: "number", minimum: 0.1, maximum: 5 },
              maxFrames: { type: "integer", minimum: 1, maximum: 100 },
              aiProvider: { type: "string", enum: ["openai", "bedrock"] },
              skipAI: { type: "boolean", description: "Set to true to skip AI metadata generation" },
            },
          },
        },
      },
      response: {
        202: { type: "object", properties: { jobId: { type: "string" }, message: { type: "string" } } },
        400: { type: "object", properties: { error: { type: "string" } } },
        403: { type: "object", properties: { error: { type: "string" } } },
        404: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (req, reply) => {
    const { videoPath, options } = req.body;

    if (!videoPath || typeof videoPath !== "string") {
      return reply.code(400).send({ error: "Invalid videoPath provided" });
    }

    const canonicalStorage = path.resolve(STORAGE_PATH, "videos");
    const resolvedPath = path.resolve(videoPath);

    // Enforce containment inside storage directory (prevent path traversal)
    if (!resolvedPath.startsWith(canonicalStorage + path.sep)) {
      return reply.code(403).send({
        error: "Access denied: videoPath must reside within the approved video storage directory",
      });
    }

    if (!fs.existsSync(resolvedPath)) {
      return reply.code(404).send({ error: "Video file not found at specified path" });
    }

    // Verify realpath to block symlink escapes
    try {
      const realPath = fs.realpathSync(resolvedPath);
      if (!realPath.startsWith(canonicalStorage + path.sep)) {
        return reply.code(403).send({ error: "Access denied: symbolic link escape detected" });
      }
    } catch (_) {
      return reply.code(400).send({ error: "Invalid file path resolution" });
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return reply.code(400).send({
        error: `Invalid file type: ${ext}. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
      });
    }

    const jobId = randomUUID();

    const job = await videoQueue.add(
      "process-video",
      {
        jobId,
        videoPath: resolvedPath,
        originalName: path.basename(resolvedPath),
        fileSize: fs.statSync(resolvedPath).size,
        options: options || {},
      },
      { jobId }
    );

    return reply.code(202).send({
      jobId: job.id,
      message: "Video queued for processing",
    });
  });
}

module.exports = uploadRoutes;
