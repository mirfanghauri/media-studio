"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// Media Studio — Image Processor (Thin Dispatcher)
// All provider implementations live in ./providers/
// All utility functions live in ./utils/
// ─────────────────────────────────────────────────────────────────────────────

const { Worker } = require("bullmq");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const getDb = require("./db");

// Pricing Engine
const { calculateImageCost } = require("../shared/pricing");

// Utils
const { STORAGE_PATH, savePartialImage, cleanupPartials } = require("./utils/storage");
const { applyBrandLogo } = require("./utils/branding");
const { convertImageFormat } = require("./utils/image");
const {
  getSetting,
  getAzureEndpoint, getAzureApiKey,
  getOpenAIApiKey,
  getVertexProjectId,
  getXAIApiKey,
} = require("./utils/settings");

// Providers
const { openaiGenerate, openaiEdit, openaiBatchProcess } = require("./providers/openai");
const { azureGenerate, azureEdit } = require("./providers/azure");
const { vertexImagePredict } = require("./providers/vertex");
const { xaiGenerate, xaiEdit } = require("./providers/xai");

// Agents
const { invokeImageAgentBrain } = require("./agents/brain");

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "2", 10);

const connection = { host: REDIS_HOST, port: REDIS_PORT };

// ─────────────────────────────────────────────────────────────────────────────
// MAIN JOB PROCESSOR
// ─────────────────────────────────────────────────────────────────────────────
async function processImageJob(job) {
  let {
    jobId, batchId, originalPath, aiProvider,
    prompt, model, imageSize, outputFormat, quality, imageCount, operationType,
    useAgentBrain,
  } = job.data;

  const db = getDb();

  try {
    await job.updateProgress(5);
    db.prepare("UPDATE image_jobs SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(jobId);

    // ── Optional Agent Brain orchestration ────────────────────────────────────
    let agentDecisions = null;
    if (useAgentBrain && operationType !== "convert") {
      let inputBuffer = null;
      if (originalPath && fs.existsSync(originalPath)) {
        inputBuffer = fs.readFileSync(originalPath);
      }
      agentDecisions = await invokeImageAgentBrain(job, job.data, inputBuffer);
      job.log(`[Agent Brain] Output: ${JSON.stringify(agentDecisions)}`);

      prompt = agentDecisions.masterPrompt || prompt;
      aiProvider = agentDecisions.routing || aiProvider;
      job.data.prompt = prompt;
      job.data.aiProvider = aiProvider;

      const t = agentDecisions.transformations || {};
      if (t.resize) { imageSize = t.resize; job.data.imageSize = imageSize; job.data.imaginaryResize = imageSize; }
      if (t.outputFormat) { outputFormat = t.outputFormat; job.data.outputFormat = outputFormat; }
      if (t.quality) { quality = t.quality; job.data.quality = quality; }
      if (t.applyLogo !== undefined) job.data.applyLogo = t.applyLogo;

      if (aiProvider === "vertex" && (!model || (!model.startsWith("gemini") && !model.startsWith("imagen")))) {
        model = getSetting("vertex_model") || "gemini-3-pro-image-preview";
        job.data.model = model;
      } else if (aiProvider === "azure" && (!model || !model.startsWith("gpt-image"))) {
        model = getSetting("azure_image_model") || getSetting("default_model") || "gpt-image-2";
        job.data.model = model;
      } else if (aiProvider === "openai" && (!model || !model.startsWith("gpt-image"))) {
        model = getSetting("openai_image_model") || getSetting("default_model") || "gpt-image-2";
        job.data.model = model;
      } else if (aiProvider === "xai" && (!model || !model.startsWith("grok-imagine"))) {
        model = getSetting("xai_image_model") || "grok-imagine-image-2.0";
        job.data.model = model;
      }
    }

    if (!model && operationType !== "convert") {
      if (aiProvider === "azure") model = getSetting("azure_image_model") || getSetting("default_model") || "gpt-image-2";
      else if (aiProvider === "vertex") model = getSetting("vertex_model") || "gemini-3-pro-image-preview";
      else if (aiProvider === "openai") model = getSetting("openai_image_model") || "gpt-image-2";
      else if (aiProvider === "xai") model = getSetting("xai_image_model") || "grok-imagine-image-2.0";
      else model = getSetting("default_model") || "gpt-image-2";
      job.data.model = model;
    }

    // ── Brand logo settings ───────────────────────────────────────────────────
    const logoEnabled = db.prepare("SELECT value FROM app_settings WHERE key = 'brand_logo_enabled'").get()?.value === "true";
    const logoPath = db.prepare("SELECT value FROM app_settings WHERE key = 'brand_logo_path'").get()?.value || "";

    let jobApplyLogo = job.data.applyLogo;
    if (typeof jobApplyLogo === "string") jobApplyLogo = jobApplyLogo === "true";
    const shouldApplyLogo = logoEnabled && (jobApplyLogo === undefined || jobApplyLogo === true);

    let logoAppliedBeforeEdit = false;

    if (operationType === "edit" && shouldApplyLogo && logoPath && fs.existsSync(logoPath)) {
      job.log(`Applying brand logo BEFORE AI edit...`);
      const logoPosition = db.prepare("SELECT value FROM app_settings WHERE key = 'brand_logo_position'").get()?.value || "bottom-right";
      const logoSize = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'brand_logo_size'").get()?.value || "15", 10);
      const logoOpacity = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'brand_logo_opacity'").get()?.value || "85", 10);

      if (originalPath && fs.existsSync(originalPath)) {
        try {
          const originalBuffer = fs.readFileSync(originalPath);
          const branded = await applyBrandLogo(originalBuffer, logoPath, {
            position: logoPosition,
            sizePercent: logoSize,
            opacity: logoOpacity,
          });
          const ext = path.extname(originalPath) || ".png";
          const brandedPath = originalPath + "_branded" + ext;
          fs.writeFileSync(brandedPath, branded);
          originalPath = brandedPath;
          job.data.originalPath = brandedPath;
          job.log("Brand logo applied to input image successfully.");
          logoAppliedBeforeEdit = true;
        } catch (err) {
          job.log(`Failed to apply brand logo before edit: ${err.message}`);
        }
      }
    }

    // ── Dispatch to provider ──────────────────────────────────────────────────
    let imageBuffers = [];

    if (operationType === "convert") {
      job.log("Operation: format conversion (bypassing AI)");
      if (!originalPath) throw new Error("No original image path provided for conversion");
      imageBuffers = [fs.readFileSync(originalPath)];

    } else if (aiProvider === "openai") {
      if (!getOpenAIApiKey()) {
        throw new Error("OpenAI API key missing. Please set OpenAI API Key in Settings under AI Provider Credentials.");
      }
      await job.updateProgress(15);
      const isBatchMode = job.data.processingMode === "batch";

      if (isBatchMode) {
        job.log(`[OpenAI] Operation: Batch API processing (50% cost discount)`);
        imageBuffers = await openaiBatchProcess(job, job.data);
      } else if (operationType === "generate" || !originalPath) {
        job.log(`[OpenAI] Operation: Real-time text-to-image generation`);
        imageBuffers = await openaiGenerate(job, job.data);
      } else {
        job.log(`[OpenAI] Operation: Real-time image editing`);
        imageBuffers = await openaiEdit(job, job.data);
      }

      await job.updateProgress(60);
      job.log(`Received ${imageBuffers.length} image(s) from OpenAI`);
      if (imageBuffers[0]) savePartialImage(jobId, 0, imageBuffers[0]);

    } else if (aiProvider === "azure") {
      if (!getAzureEndpoint() || !getAzureApiKey()) {
        throw new Error("Azure OpenAI credentials missing. Please set Azure Endpoint and API Key in Settings.");
      }
      await job.updateProgress(15);

      if (operationType === "generate" || !originalPath) {
        job.log("Operation: Azure text-to-image generation");
        imageBuffers = await azureGenerate(job, job.data);
      } else {
        job.log("Operation: Azure image editing");
        imageBuffers = await azureEdit(job, job.data);
      }

      await job.updateProgress(60);
      job.log(`Received ${imageBuffers.length} image(s) from Azure`);
      if (imageBuffers[0]) savePartialImage(jobId, 0, imageBuffers[0]);

    } else if (aiProvider === "vertex") {
      if (!getVertexProjectId()) {
        throw new Error("Google Vertex AI credentials missing. Please set Project ID in Settings.");
      }
      await job.updateProgress(15);

      if (operationType === "generate" || !originalPath) {
        job.log("Operation: Vertex AI text-to-image generation");
        imageBuffers = await vertexImagePredict(job, job.data, "generate");
      } else {
        job.log("Operation: Vertex AI image editing");
        imageBuffers = await vertexImagePredict(job, job.data, "edit");
      }

      await job.updateProgress(60);
      job.log(`Received ${imageBuffers.length} image(s) from Vertex AI`);
      if (imageBuffers[0]) savePartialImage(jobId, 0, imageBuffers[0]);

    } else if (aiProvider === "xai") {
      if (!getXAIApiKey()) {
        throw new Error("xAI API key missing. Please set xAI API Key in Settings under AI Provider Credentials.");
      }
      await job.updateProgress(15);

      if (operationType === "generate" || !originalPath) {
        job.log("[xAI] Operation: Text-to-image generation");
        imageBuffers = await xaiGenerate(job, job.data);
      } else {
        job.log("[xAI] Operation: Image editing (Grok Imagine JSON)");
        imageBuffers = await xaiEdit(job, job.data);
      }

      await job.updateProgress(60);
      job.log(`Received ${imageBuffers.length} image(s) from xAI`);
      if (imageBuffers[0]) savePartialImage(jobId, 0, imageBuffers[0]);

    } else {
      throw new Error(`Unknown AI provider: ${aiProvider}`);
    }

    await job.updateProgress(65);

    // ── Brand Logo Compositing (post-generation) ──────────────────────────────
    if (shouldApplyLogo && !logoAppliedBeforeEdit && logoPath && fs.existsSync(logoPath)) {
      const logoPosition = db.prepare("SELECT value FROM app_settings WHERE key = 'brand_logo_position'").get()?.value || "bottom-right";
      const logoSize = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'brand_logo_size'").get()?.value || "15", 10);
      const logoOpacity = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'brand_logo_opacity'").get()?.value || "85", 10);

      job.log(`Applying brand logo: position=${logoPosition}, size=${logoSize}%, opacity=${logoOpacity}%`);

      const loggedBuffers = [];
      for (let i = 0; i < imageBuffers.length; i++) {
        try {
          const branded = await applyBrandLogo(imageBuffers[i], logoPath, {
            position: logoPosition,
            sizePercent: logoSize,
            opacity: logoOpacity,
          });
          loggedBuffers.push(branded);
        } catch (logoErr) {
          job.log(`Logo compositing failed for image ${i + 1}: ${logoErr.message}. Using original.`);
          loggedBuffers.push(imageBuffers[i]);
        }
      }
      imageBuffers = loggedBuffers;
      job.log("Brand logo applied to all images");
    }

    await job.updateProgress(75);

    // ── Post-process: Convert via Imaginary / Sharp ───────────────────────────
    let compressionLevel;
    if (job.data.imaginaryCompressionLevel) {
      compressionLevel = parseInt(job.data.imaginaryCompressionLevel, 10);
    } else {
      compressionLevel = parseInt(
        db.prepare("SELECT value FROM app_settings WHERE key = 'imaginary_compression_level'").get()?.value || "85",
        10
      );
    }

    let resizeBehavior = job.data.imaginaryResizeBehavior;
    if (!resizeBehavior) {
      resizeBehavior = db.prepare("SELECT value FROM app_settings WHERE key = 'imaginary_resize_behavior'").get()?.value || "fit";
    }

    const fmt = (outputFormat || "png").toLowerCase();
    const targetSize = job.data.operationType === "convert"
      ? job.data.imaginaryResize
      : (imageSize || "original");

    const finalBuffers = [];
    for (let i = 0; i < imageBuffers.length; i++) {
      job.log(`Converting image ${i + 1}/${imageBuffers.length} → ${fmt} (size: ${targetSize}, behavior: ${resizeBehavior}, quality: ${compressionLevel})`);
      const converted = await convertImageFormat(imageBuffers[i], fmt, compressionLevel, targetSize, resizeBehavior, job);
      finalBuffers.push(converted);
    }

    await job.updateProgress(90);

    // ── Save result(s) to disk ────────────────────────────────────────────────
    const extMap = { png: ".png", jpg: ".jpg", jpeg: ".jpg", webp: ".webp", avif: ".avif" };
    const finalExt = extMap[fmt] || ".png";

    let resultPath;
    if (finalBuffers.length === 1) {
      const resultName = `${jobId}_result${finalExt}`;
      resultPath = path.join(STORAGE_PATH, "images", resultName);
      fs.writeFileSync(resultPath, finalBuffers[0]);
    } else {
      const paths = finalBuffers.map((buf, i) => {
        const resultName = `${jobId}_result_${i + 1}${finalExt}`;
        const p = path.join(STORAGE_PATH, "images", resultName);
        fs.writeFileSync(p, buf);
        return p;
      });
      resultPath = paths[0];
    }

    cleanupPartials(jobId);
    await job.updateProgress(100);

    const finalMeta = await sharp(finalBuffers[0]).metadata();

    const costResult = calculateImageCost({
      provider: aiProvider,
      model,
      usage: job.data.usageTokens || null,
      dimensions: imageSize,
      processingMode: job.data.processingMode || "realtime",
      operationType,
      quality,
      imageCount: finalBuffers.length,
    });

    const metadata = JSON.stringify({
      model: operationType === "convert" ? null : model, imageSize, outputFormat: fmt, quality,
      imageCount: finalBuffers.length,
      processingMode: job.data.processingMode || "realtime",
      usage: costResult.usageDetails,
      cost_breakdown: costResult.costBreakdown,
      cost: costResult.totalCost,
      tokens_used: costResult.totalTokens,
      logoApplied: logoEnabled && !!logoPath,
      original_size: originalPath && fs.existsSync(originalPath) ? fs.statSync(originalPath).size : 0,
      optimized_size: finalBuffers[0]?.length || 0,
      result_width: finalMeta.width,
      result_height: finalMeta.height,
      agentBrain: agentDecisions || null,
    });

    const actualDimension = (finalMeta?.width && finalMeta?.height)
      ? `${finalMeta.width}x${finalMeta.height}`
      : (imageSize || '1920x1080');

    db.prepare(`
      UPDATE image_jobs
      SET status = 'completed', result_path = ?, metadata = ?, image_size = ?, cost = ?, tokens_used = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(resultPath, metadata, actualDimension, costResult.totalCost, costResult.totalTokens, jobId);

    return { success: true, resultPath };

  } catch (error) {
    const apiDetail = error.response?.data?.error?.message 
      || error.response?.data?.message 
      || (typeof error.response?.data === "string" ? error.response.data : null);
    let errorMsg = apiDetail ? `${error.message}: ${apiDetail}` : error.message;

    if (errorMsg.startsWith("RATE_LIMIT_EXCEEDED:")) {
      console.error(`[JOB_FAIL][rate_limit] Job ${jobId}:`, errorMsg);
    } else if (errorMsg.startsWith("CONTENT_POLICY_VIOLATION:")) {
      console.error(`[JOB_FAIL][content_policy] Job ${jobId}:`, errorMsg);
    } else {
      console.error(`[JOB_FAIL][error] Job ${jobId}:`, errorMsg);
    }

    db.prepare(`
      UPDATE image_jobs
      SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(errorMsg, jobId);

    cleanupPartials(jobId);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BullMQ WORKER
// ─────────────────────────────────────────────────────────────────────────────
const worker = new Worker("image-processing", async (job) => {
  if (job.name === "edit-image") {
    return processImageJob(job);
  }
}, {
  connection,
  concurrency: CONCURRENCY,
});

worker.on("completed", (job) => {
  console.log(`[DONE] Image Job ${job.id} (jobId=${job.data?.jobId}) completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[FAIL] Image Job ${job?.id} (jobId=${job?.data?.jobId}) failed:`, err.message);
});

console.log(`Media Studio Image Worker started — concurrency=${CONCURRENCY}`);
