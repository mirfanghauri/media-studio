"use strict";

const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const { videoQueue } = require("../queue");

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, "..", "..", "storage");
const ALLOWED_EXTENSIONS = new Set([".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".wmv", ".m4v"]);
const MAX_FILENAME_LENGTH = 200;

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, MAX_FILENAME_LENGTH);
}

async function uploadRoutes(app) {
  // Upload video file
  app.post("/upload", {
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
    let data = null;
    let skipAI = false;
    let whisperModel, framesPerSecond, maxFrames, aiProvider;

    for await (const part of parts) {
      if (part.type === "file") {
        data = part;
        // Consume remaining stream into a buffer so we can save after parsing fields
        const chunks = [];
        for await (const chunk of part.file) chunks.push(chunk);
        data._buffer = Buffer.concat(chunks);
      } else {
        if (part.fieldname === "skipAI") skipAI = part.value === "true" || part.value === "1";
        if (part.fieldname === "whisperModel") whisperModel = part.value;
        if (part.fieldname === "framesPerSecond") framesPerSecond = parseFloat(part.value);
        if (part.fieldname === "maxFrames") maxFrames = parseInt(part.value, 10);
        if (part.fieldname === "aiProvider") aiProvider = part.value;
      }
    }

    if (!data) {
      return reply.code(400).send({ error: "No file uploaded" });
    }

    const ext = path.extname(data.filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return reply.code(400).send({
        error: `Invalid file type: ${ext}. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
      });
    }

    const jobId = randomUUID();
    const safeName = sanitizeFilename(data.filename);
    const videoDir = path.join(STORAGE_PATH, "videos", jobId);
    fs.mkdirSync(videoDir, { recursive: true });

    const videoPath = path.join(videoDir, safeName);
    fs.writeFileSync(videoPath, data._buffer);

    const stats = fs.statSync(videoPath);

    const job = await videoQueue.add(
      "process-video",
      {
        jobId,
        videoPath,
        originalName: data.filename,
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

    return reply.code(202).send({
      jobId: job.id,
      message: skipAI
        ? "Video uploaded and queued for processing (AI metadata generation skipped)"
        : "Video uploaded and queued for processing",
      originalName: data.filename,
      fileSize: stats.size,
      skipAI,
    });
  });

  // Process a video already on the server filesystem
  app.post("/process", {
    schema: {
      tags: ["video"],
      summary: "Process a file already on the server",
      description: "Queue a video file that already exists inside the container's storage path. Use `options.skipAI=true` to skip AI generation.",
      body: {
        type: "object",
        required: ["videoPath"],
        properties: {
          videoPath: { type: "string", description: "Absolute path inside the container, e.g. /app/storage/videos/jobId/video.mp4" },
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
      },
    },
  }, async (req, reply) => {
    const { videoPath, options } = req.body;

    if (!fs.existsSync(videoPath)) {
      return reply.code(400).send({ error: "Video file not found at specified path" });
    }

    const jobId = randomUUID();

    const job = await videoQueue.add(
      "process-video",
      {
        jobId,
        videoPath,
        originalName: path.basename(videoPath),
        fileSize: fs.statSync(videoPath).size,
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
