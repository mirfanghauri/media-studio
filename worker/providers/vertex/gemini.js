"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { getVertexProjectId, getVertexLocation } = require("../../utils/settings");
const { withRetry } = require("../../utils/retry");
const { getVertexAccessToken } = require("./auth");

/**
 * Gemini image generation via generateContent API.
 * Handles both:
 *   - Native image models (gemini-*-image) → responseModalities: IMAGE
 *   - Vision/text models → analyse image, enhance prompt, delegate to flash-image
 *
 * @param {object} job     BullMQ job
 * @param {object} jobData Job data payload
 * @param {'generate'|'edit'} mode
 * @returns {Buffer[]} Array of image buffers
 */
async function vertexGeminiGenerate(job, jobData, mode) {
  const { prompt, model, imageSize, quality, imageCount, originalPath } = jobData;
  const projectId = getVertexProjectId();
  const location = getVertexLocation() || "global";

  if (!projectId) {
    throw new Error("Vertex AI project ID missing. Please set it in Settings under AI Provider Credentials.");
  }

  const safeModel = model || "gemini-2.5-flash";
  const host = location === "global"
    ? "aiplatform.googleapis.com"
    : `${location}-aiplatform.googleapis.com`;
  const apiEndpoint = `https://${host}/v1beta1/projects/${projectId}/locations/${location}/publishers/google/models/${safeModel}:generateContent`;

  const accessToken = await getVertexAccessToken();

  // Build parts array (text + optional image for edit mode)
  const parts = [];
  if (mode === "edit" && originalPath && fs.existsSync(originalPath)) {
    const imgBuffer = fs.readFileSync(originalPath);
    const ext = path.extname(originalPath).toLowerCase();
    let mimeType = "image/png";
    if (ext === ".webp") mimeType = "image/webp";
    else if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
    else if (ext === ".avif") mimeType = "image/avif";
    parts.push({ inlineData: { mimeType, data: imgBuffer.toString("base64") } });
    parts.push({ text: prompt || "Transform and enhance this image." });
  } else {
    parts.push({ text: prompt || "Generate a high quality visual image." });
  }

  const isNativeImageModel = safeModel.includes("-image") || safeModel.startsWith("imagen-");

  if (isNativeImageModel) {
    const numImages = Math.min(Math.max(parseInt(imageCount, 10) || 1, 1), 4);
    const requestBody = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        temperature: quality === "high" ? 0.4 : 0.8,
        candidateCount: numImages,
      },
    };

    job.log(`[Vertex Gemini Image ${mode === "edit" ? "Edit" : "Generate"}] model=${safeModel} count=${numImages}...`);

    let response;
    try {
      response = await withRetry(async () => {
        return await axios.post(apiEndpoint, requestBody, {
          headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
          timeout: 180000,
        });
      }, job, `VertexGeminiImage-${mode}`);
    } catch (primaryErr) {
      // Quota fallback: try gemini-3.1-flash-image if pro quota exhausted
      if (safeModel !== "gemini-3.1-flash-image" && primaryErr.response?.status === 429) {
        job.log(`[Vertex Gemini Image] ${safeModel} quota reached (429), falling back to gemini-3.1-flash-image...`);
        const fallbackEndpoint = `https://${host}/v1beta1/projects/${projectId}/locations/${location}/publishers/google/models/gemini-3.1-flash-image:generateContent`;
        response = await axios.post(fallbackEndpoint, requestBody, {
          headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
          timeout: 180000,
        });
      } else {
        throw primaryErr;
      }
    }

    const candidates = response.data?.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("Vertex Gemini returned no candidates in response");
    }

    const buffers = [];
    for (const candidate of candidates) {
      const respParts = candidate.content?.parts || [];
      for (const part of respParts) {
        if (part.inlineData?.data) {
          buffers.push(Buffer.from(part.inlineData.data, "base64"));
        }
      }
    }

    if (buffers.length === 0) {
      throw new Error("Vertex Gemini did not return any image data in response");
    }
    return buffers;
  }

  // Vision/text model path — analyse with current model, then delegate to native image model
  const requestBody = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: quality === "high" ? 0.4 : 0.7, maxOutputTokens: 600 },
  };

  job.log(`[Vertex Gemini ${mode === "edit" ? "Edit" : "Generate"}] Analysing with ${safeModel}...`);

  let enhancedPrompt = prompt;
  try {
    const response = await withRetry(async () => {
      return await axios.post(apiEndpoint, requestBody, {
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        timeout: 60000,
      });
    }, job, `VertexGemini-${mode}`);

    const textPart = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (textPart && textPart.trim()) {
      enhancedPrompt = textPart.trim();
      job.log(`[Vertex Gemini] Prompt synthesised: "${enhancedPrompt.substring(0, 100)}…"`);
    }
  } catch (geminiErr) {
    job.log(`[Vertex Gemini] Vision analysis warning (${geminiErr.message}), proceeding with input prompt.`);
  }

  // Delegate to native image generator
  const renderJobData = { ...jobData, prompt: enhancedPrompt, model: "gemini-3.1-flash-image" };
  return await vertexGeminiGenerate(job, renderJobData, mode);
}

module.exports = { vertexGeminiGenerate };
