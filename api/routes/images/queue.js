"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Queue } = require("bullmq");
const getDb = require("../../db");
const { verifyAuth, getAppSetting } = require("../../middleware/auth");

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, "..", "..", "..", "storage");

const imageQueue = new Queue("image-processing", {
  connection: {
    host: process.env.REDIS_HOST || "redis",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
  },
});

module.exports = async function (fastify, opts) {
  fastify.post("/images/edit", { preHandler: [verifyAuth] }, async (request, reply) => {
    const parts = request.parts();
    const batchId = crypto.randomUUID();
    const db = getDb();
    const defaultProvider = getAppSetting(db, "default_ai_provider") || "openai";
    const defaultModel = getAppSetting(db, "default_model") || "gpt-image-2";
    const defaultSize = getAppSetting(db, "default_image_size") || "1920x1088";
    const defaultFormat = getAppSetting(db, "default_output_format") || "webp";
    const defaultQuality = getAppSetting(db, "default_quality") || "high";

    let aiProvider = defaultProvider;
    let isBatchPrompt = true;
    let batchPrompt = "";
    let model = defaultModel;
    let imageSize = defaultSize;
    let outputFormat = defaultFormat;
    let quality = defaultQuality;
    let imageCount = 1;
    let operationType = "edit";
    let processingMode = null;
    let applyLogo = true;
    let imaginaryCompressionLevel = null;
    let imaginaryResize = null;
    let imaginaryResizeBehavior = null;
    let useAgentBrain = false;
    let bypassPromptTemplate = false;
    const files = [];
    const individualPrompts = {};

    for await (const part of parts) {
      if (part.type === "file") {
        const jobId = crypto.randomUUID();
        const ext = path.extname(part.filename).toLowerCase();
        const safeName = `${jobId}${ext}`;
        const savePath = path.join(STORAGE_PATH, "images", safeName);

        await new Promise((resolve, reject) => {
          const stream = fs.createWriteStream(savePath);
          part.file.pipe(stream);
          part.file.on("end", resolve);
          part.file.on("error", reject);
        });

        files.push({ jobId, filename: part.filename, path: savePath });
      } else {
        if (part.fieldname === "aiProvider" || part.fieldname === "ai_provider") aiProvider = part.value;
        if (part.fieldname === "isBatchPrompt" || part.fieldname === "is_batch_prompt") isBatchPrompt = part.value === "true" || part.value === true;
        if (part.fieldname === "batchPrompt" || part.fieldname === "batch_prompt" || part.fieldname === "prompt") batchPrompt = part.value;
        if (part.fieldname === "model") model = part.value;
        if (part.fieldname === "imageSize" || part.fieldname === "image_size") imageSize = part.value;
        if (part.fieldname === "outputFormat" || part.fieldname === "output_format") outputFormat = part.value;
        if (part.fieldname === "quality") quality = part.value;
        if (part.fieldname === "imageCount" || part.fieldname === "image_count") imageCount = parseInt(part.value, 10) || 1;
        if (part.fieldname === "operationType" || part.fieldname === "operation_type") operationType = part.value;
        if (part.fieldname === "processingMode" || part.fieldname === "processing_mode") {
          const val = (part.value || "").toLowerCase().trim();
          if (val === "batch" || val === "realtime") processingMode = val;
        }
        if (part.fieldname === "applyLogo" || part.fieldname === "apply_logo") applyLogo = part.value === "true";
        if (part.fieldname === "imaginaryCompressionLevel" || part.fieldname === "imaginary_compression_level") imaginaryCompressionLevel = part.value;
        if (part.fieldname === "imaginaryResize" || part.fieldname === "imaginary_resize") imaginaryResize = part.value;
        if (part.fieldname === "imaginaryResizeBehavior" || part.fieldname === "imaginary_resize_behavior") imaginaryResizeBehavior = part.value;
        if (part.fieldname === "useAgentBrain" || part.fieldname === "use_agent_brain") useAgentBrain = part.value === "true";
        if (part.fieldname === "bypassPromptTemplate" || part.fieldname === "bypass_prompt_template") bypassPromptTemplate = part.value === "true";
        if (part.fieldname.startsWith("prompt_")) {
          const index = part.fieldname.split("_")[1];
          individualPrompts[index] = part.value;
        }
      }
    }

    // ── Default processingMode: OpenAI gpt-image-2 defaults to batch processing (50% Off) ──
    if (!processingMode) {
      if (aiProvider === "openai" && (model === "gpt-image-2" || !model)) {
        processingMode = "batch";
      } else {
        processingMode = "realtime";
      }
    } else if (aiProvider !== "openai" && processingMode === "batch") {
      processingMode = "realtime";
    }

    // ── Input validation ──────────────────────────────────────────────────────
    const MAX_IMAGE_COUNT = 10;
    const MAX_PROMPT_LENGTH = 5000;
    const MAX_FILES_PER_BATCH = 50;

    if (imageCount < 1 || imageCount > MAX_IMAGE_COUNT) {
      return reply.code(400).send({ error: `imageCount must be between 1 and ${MAX_IMAGE_COUNT}`, code: "INVALID_IMAGE_COUNT" });
    }
    if (batchPrompt && batchPrompt.length > MAX_PROMPT_LENGTH) {
      return reply.code(400).send({ error: `batchPrompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`, code: "PROMPT_TOO_LONG" });
    }
    for (const [index, prompt] of Object.entries(individualPrompts)) {
      if (prompt && prompt.length > MAX_PROMPT_LENGTH) {
        return reply.code(400).send({ error: `prompt_${index} exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`, code: "PROMPT_TOO_LONG" });
      }
    }
    if (files.length > MAX_FILES_PER_BATCH) {
      return reply.code(400).send({ error: `Too many files. Maximum ${MAX_FILES_PER_BATCH} files per batch`, code: "TOO_MANY_FILES" });
    }

    if (operationType === "convert") {
      aiProvider = "none";
      model = null;
      processingMode = "realtime";
    }

    const VALID_PROVIDERS = ["azure", "vertex", "openai", "xai", "bedrock", "none", "local"];
    if (!VALID_PROVIDERS.includes(aiProvider)) {
      return reply.code(400).send({ error: `Invalid aiProvider. Must be one of: ${VALID_PROVIDERS.join(", ")}`, code: "INVALID_PROVIDER" });
    }

    const VALID_OPERATIONS = ["edit", "generate", "convert"];
    if (!VALID_OPERATIONS.includes(operationType)) {
      return reply.code(400).send({ error: `Invalid operationType. Must be one of: ${VALID_OPERATIONS.join(", ")}`, code: "INVALID_OPERATION" });
    }

    const VALID_FORMATS = ["png", "jpg", "jpeg", "webp", "avif"];
    if (!VALID_FORMATS.includes(outputFormat.toLowerCase())) {
      return reply.code(400).send({ error: `Invalid outputFormat. Must be one of: ${VALID_FORMATS.join(", ")}`, code: "INVALID_FORMAT" });
    }

    const VALID_QUALITIES = ["low", "medium", "high"];
    if (!VALID_QUALITIES.includes(quality.toLowerCase())) {
      return reply.code(400).send({ error: `Invalid quality. Must be one of: ${VALID_QUALITIES.join(", ")}`, code: "INVALID_QUALITY" });
    }

    // Sanitize prompt
    if (batchPrompt) {
      batchPrompt = batchPrompt.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    }

    // For pure text-to-image generation (no input files)
    if (files.length === 0 && operationType === "generate" && batchPrompt) {
      const jobId = crypto.randomUUID();
      files.push({ jobId, filename: null, path: null });
    }

    if (files.length === 0) {
      return reply.code(400).send({ error: "No files uploaded" });
    }

    const templateRow = db.prepare("SELECT value FROM app_settings WHERE key = 'default_prompt_template'").get();
    const promptTemplate = templateRow ? templateRow.value : "";

    const jobsToQueue = [];

    files.forEach((file, index) => {
      const individualPrompt = individualPrompts[index] || individualPrompts[String(index)];
      const rawPrompt = isBatchPrompt
        ? (batchPrompt || individualPrompt || "")
        : (individualPrompt || batchPrompt || "");
      const prompt = (promptTemplate && !bypassPromptTemplate) ? `${promptTemplate} ${rawPrompt}`.trim() : rawPrompt;

      db.prepare(`
        INSERT INTO image_jobs (id, batch_id, status, original_filename, original_path, ai_provider, prompt, model, image_size, output_format, quality, image_count, operation_type, processing_mode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        file.jobId, batchId, "waiting",
        file.filename || "generate", file.path || "",
        aiProvider, prompt, model, imageSize, outputFormat, quality, imageCount, operationType, processingMode
      );

      jobsToQueue.push({
        name: "edit-image",
        data: {
          jobId: file.jobId, batchId,
          originalPath: file.path,
          aiProvider, prompt, model, imageSize, outputFormat, quality, imageCount, operationType, processingMode,
          applyLogo, imaginaryCompressionLevel, imaginaryResize, imaginaryResizeBehavior, useAgentBrain,
        },
      });
    });

    await imageQueue.addBulk(jobsToQueue);

    return {
      message: "Images queued for processing",
      batchId,
      jobIds: jobsToQueue.map(j => j.data.jobId),
      jobCount: jobsToQueue.length,
    };
  });
};
