"use strict";

const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const { videoQueue } = require("../queue");
const { createSlideshow, validateImage, ALLOWED_IMAGE_EXTENSIONS } = require("../services/slideshow");
const { verifyAuth } = require("../middleware/auth");

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, "..", "..", "storage");
const MAX_IMAGES = 100;
const MAX_FILENAME_LENGTH = 200;

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, MAX_FILENAME_LENGTH);
}

async function imagesToVideoRoutes(app) {
  /**
   * POST /api/images-to-video
   *
   * Accepts multipart/form-data with:
   *   - images      (required) — one or more image files
   *   - duration    (optional) — seconds per slide, default 3
   *   - transition  (optional) — "fade" | "none", default "fade"
   *   - resolution  (optional) — "1280:720" | "1920:1080" | "720:720", default "1280:720"
   *   - text        (optional) — text overlay drawn on every slide
   *   - music       (optional) — background audio file
   *   - whisperModel(optional) — whisper model for any audio pass-through
   *   - aiProvider  (optional) — "openai" | "bedrock"
   */
  app.post("/images-to-video", {
    preHandler: [verifyAuth],
    schema: {
      tags: ["images"],
      summary: "Images → slideshow → AI metadata",
      description: "Upload 1–100 images. Media Studio generates an FFmpeg slideshow, extracts frames, transcribes any music audio, and runs the full AI metadata pipeline — returning YouTube title, description, tags, hashtags. Add `skipAI=true` to skip AI and return only transcript + frame data.",
      consumes: ["multipart/form-data"],
      body: {
        type: "object",
        properties: {
          images: { type: "string", format: "binary", description: "Image files (.jpg, .jpeg, .png, .webp, .bmp, .tiff, .gif) — repeat field for multiple images" },
          duration: { type: "string", description: "Seconds each image is shown (1–30). Default: 3" },
          transition: { type: "string", description: "Transition between slides: fade | none. Default: fade" },
          resolution: { type: "string", description: "Output resolution: 1280:720 | 1920:1080 | 720:720 | 1080:1920. Default: 1280:720" },
          text: { type: "string", description: "Text overlay drawn on every slide (max 100 chars)" },
          music: { type: "string", format: "binary", description: "Background audio (.mp3, .aac, .m4a, .ogg, .wav)" },
          whisperModel: { type: "string", description: "Whisper model: tiny | base | small | medium" },
          aiProvider: { type: "string", description: "AI provider: openai | bedrock" },
          skipAI: { type: "string", description: "Set to 'true' to skip AI metadata generation" },
        },
      },
      response: {
        202: {
          type: "object",
          properties: {
            jobId: { type: "string" },
            message: { type: "string" },
            skipAI: { type: "boolean" },
            slideshow: {
              type: "object",
              properties: {
                videoPath: { type: "string" },
                images: { type: "number" },
                slideDuration: { type: "number" },
                transition: { type: "string" },
                resolution: { type: "string" },
                textOverlay: { type: "string", nullable: true },
                hasMusic: { type: "boolean" },
              },
            },
          },
        },
        400: { type: "object", properties: { error: { type: "string" } } },
      },
    },
    validatorCompiler: () => () => true, // disable body validation for multipart
  }, async (req, reply) => {
    const jobId = randomUUID();
    const uploadDir = path.join(STORAGE_PATH, "images", jobId);
    fs.mkdirSync(uploadDir, { recursive: true });

    // Allowed resolutions (whitelist to prevent injection)
    const ALLOWED_RESOLUTIONS = new Set(["1280:720", "1920:1080", "720:720", "1080:1920"]);

    const imagePaths = [];
    let slideDuration = 3;
    let transition = "fade";
    let resolution = "1280:720";
    let textOverlay = null;
    let musicPath = null;
    let jobOptions = {};

    try {
      // Stream all multipart parts
      const parts = req.parts();

      for await (const part of parts) {
        if (part.type === "file") {
          if (part.fieldname === "images") {
            if (imagePaths.length >= MAX_IMAGES) {
              // Drain and skip to prevent memory buffering
              part.file.resume();
              continue;
            }

            // Validate image type before saving
            try {
              validateImage(part.filename, part.filename);
            } catch (e) {
              part.file.resume();
              fs.rmSync(uploadDir, { recursive: true, force: true });
              if (musicPath && fs.existsSync(musicPath)) {
                try { fs.unlinkSync(musicPath); } catch (_) {}
              }
              return reply.code(400).send({ error: e.message });
            }

            const safeName = sanitizeFilename(part.filename);
            // Prefix with index to preserve upload order
            const paddedIndex = String(imagePaths.length + 1).padStart(4, "0");
            const destPath = path.join(uploadDir, `${paddedIndex}_${safeName}`);

            // Stream directly to disk to prevent RAM exhaustion
            await new Promise((resolve, reject) => {
              const ws = fs.createWriteStream(destPath);
              part.file.pipe(ws);
              ws.on("finish", resolve);
              ws.on("error", (err) => {
                try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) {}
                reject(err);
              });
              part.file.on("error", (err) => {
                try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) {}
                reject(err);
              });
            });

            if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
              imagePaths.push(destPath);
            } else if (fs.existsSync(destPath)) {
              try { fs.unlinkSync(destPath); } catch (_) {}
            }
          } else if (part.fieldname === "music") {
            const ext = path.extname(part.filename).toLowerCase();
            const ALLOWED_AUDIO = new Set([".mp3", ".aac", ".m4a", ".ogg", ".wav"]);
            if (!ALLOWED_AUDIO.has(ext)) {
              part.file.resume();
              fs.rmSync(uploadDir, { recursive: true, force: true });
              if (musicPath && fs.existsSync(musicPath)) {
                try { fs.unlinkSync(musicPath); } catch (_) {}
              }
              return reply.code(400).send({ error: `Invalid audio type: ${ext}` });
            }
            const musicDir = path.join(STORAGE_PATH, "music");
            fs.mkdirSync(musicDir, { recursive: true });
            const safeMusicName = sanitizeFilename(part.filename);
            musicPath = path.join(musicDir, `${jobId}_${safeMusicName}`);

            // Stream audio directly to disk
            await new Promise((resolve, reject) => {
              const ws = fs.createWriteStream(musicPath);
              part.file.pipe(ws);
              ws.on("finish", resolve);
              ws.on("error", (err) => {
                try { if (fs.existsSync(musicPath)) fs.unlinkSync(musicPath); } catch (_) {}
                reject(err);
              });
              part.file.on("error", (err) => {
                try { if (fs.existsSync(musicPath)) fs.unlinkSync(musicPath); } catch (_) {}
                reject(err);
              });
            });
          } else {
            // Unknown file field — drain without buffering
            part.file.resume();
          }
        } else {
          // Text fields
          const val = part.value;
          switch (part.fieldname) {
            case "duration":
              slideDuration = Math.min(30, Math.max(1, parseFloat(val) || 3));
              break;
            case "transition":
              transition = val || "fade";
              break;
            case "resolution":
              if (ALLOWED_RESOLUTIONS.has(val)) resolution = val;
              break;
            case "text":
              // Limit text overlay length
              textOverlay = String(val).substring(0, 100) || null;
              break;
            case "whisperModel":
              if (["tiny", "base", "small", "medium"].includes(val)) {
                jobOptions.whisperModel = val;
              }
              break;
            case "aiProvider":
              if (["openai", "bedrock"].includes(val)) {
                jobOptions.aiProvider = val;
              }
              break;
            case "skipAI":
              jobOptions.skipAI = val === "true" || val === "1";
              break;
          }
        }
      }

      if (imagePaths.length === 0) {
        return reply.code(400).send({
          error: `No valid images uploaded. Allowed formats: ${[...ALLOWED_IMAGE_EXTENSIONS].join(", ")}`,
        });
      }

      // Generate slideshow video
      const videoPath = await createSlideshow(
        jobId,
        imagePaths,
        { slideDuration, transition, resolution, textOverlay, musicPath },
        STORAGE_PATH
      );

      const stats = fs.statSync(videoPath);

      // Record job in history
      try {
        const getDb = require("../db");
        const db = getDb();
        db.prepare(`
          INSERT INTO image_jobs (id, batch_id, status, original_filename, original_path, ai_provider, prompt, model, image_size, output_format, quality, image_count, operation_type, result_path)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          jobId,
          null,
          "completed",
          `slideshow_${imagePaths.length}_images.mp4`,
          imagePaths[0] || "",
          "ffmpeg",
          `Video Slideshow (${imagePaths.length} images, ${transition || "fade"} transition)`,
          "FFmpeg Slideshow",
          resolution || "1920x1080",
          "MP4",
          "high",
          imagePaths.length,
          "slideshow",
          videoPath
        );
      } catch (dbErr) {
        req.log.warn(`Failed to log slideshow job to history: ${dbErr.message}`);
      }

      // Push into the existing video processing pipeline
      const job = await videoQueue.add(
        "process-video",
        {
          jobId,
          videoPath,
          originalName: `slideshow_${imagePaths.length}_images.mp4`,
          fileSize: stats.size,
          inputType: "images",
          slideshowOptions: { slideDuration, transition, resolution, textOverlay, imageCount: imagePaths.length },
          options: jobOptions,
        },
        { jobId }
      );

      return reply.code(202).send({
        jobId: job.id,
        message: jobOptions.skipAI
          ? `${imagePaths.length} image(s) converted to slideshow and queued (AI metadata generation skipped)`
          : `${imagePaths.length} image(s) converted to slideshow and queued for AI processing`,
        skipAI: jobOptions.skipAI || false,
        slideshow: {
          videoPath,
          images: imagePaths.length,
          slideDuration,
          transition,
          resolution,
          textOverlay: textOverlay || null,
          hasMusic: !!musicPath,
        },
      });
    } catch (err) {
      // Cleanup on error
      fs.rmSync(uploadDir, { recursive: true, force: true });
      if (musicPath && fs.existsSync(musicPath)) {
        try { fs.unlinkSync(musicPath); } catch (_) {}
      }
      throw err;
    }
  });

  /**
   * GET /api/images-to-video/info
   * Returns supported options for the endpoint.
   */
  app.get("/images-to-video/info", {
    schema: {
      tags: ["images"],
      summary: "Supported options for images-to-video",
      description: "Returns all supported image formats, resolutions, and field documentation for the POST /api/images-to-video endpoint.",
      response: {
        200: { type: "object", additionalProperties: true },
      },
    },
  }, async () => {
    return {
      maxImages: MAX_IMAGES,
      supportedImageFormats: [...ALLOWED_IMAGE_EXTENSIONS],
      supportedAudioFormats: [".mp3", ".aac", ".m4a", ".ogg", ".wav"],
      supportedResolutions: ["1280:720", "1920:1080", "720:720", "1080:1920"],
      defaultsPerSlide: 3,
      fields: {
        images: "required, multipart file(s)",
        duration: "optional, seconds per slide (1–30), default: 3",
        transition: "optional, 'fade' | 'none', default: 'fade'",
        resolution: "optional, '1280:720' | '1920:1080' | '720:720' | '1080:1920', default: '1280:720'",
        text: "optional, text overlay on all slides (max 100 chars)",
        music: "optional, background audio file",
        whisperModel: "optional, 'tiny' | 'base' | 'small' | 'medium'",
        aiProvider: "optional, 'openai' | 'bedrock'",
        skipAI: "optional, 'true' to skip AI metadata and return only transcript + frames",
      },
    };
  });
}

module.exports = imagesToVideoRoutes;
