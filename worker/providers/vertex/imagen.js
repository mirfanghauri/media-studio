"use strict";

const fs = require("fs");
const axios = require("axios");
const { getVertexProjectId, getVertexLocation } = require("../../utils/settings");
const { withRetry } = require("../../utils/retry");
const { deriveAspectRatio } = require("../../utils/image");
const { getVertexAccessToken } = require("./auth");

/**
 * Vertex AI Imagen image generation / editing via the predict API.
 * Used for imagen-* model variants.
 *
 * @param {object} job     BullMQ job
 * @param {object} jobData Job data payload
 * @param {'generate'|'edit'} mode
 * @returns {Buffer[]} Array of image buffers
 */
async function vertexImagenPredict(job, jobData, mode) {
  const { prompt, model, imageSize, quality, imageCount, originalPath } = jobData;
  const projectId = getVertexProjectId();
  const location = getVertexLocation();

  if (!projectId) {
    throw new Error("Vertex AI project ID missing. Please set it in Settings under AI Provider Credentials.");
  }

  const safeModel = model || "imagen-3.0-generate-001";
  const host = location === "global"
    ? "aiplatform.googleapis.com"
    : `${location}-aiplatform.googleapis.com`;
  const apiEndpoint = `https://${host}/v1beta1/projects/${projectId}/locations/${location}/publishers/google/models/${safeModel}:predict`;

  const [w, h] = (imageSize || "1024x1024").split("x").map(Number);
  const aspectRatio = deriveAspectRatio(w, h);

  const accessToken = await getVertexAccessToken();

  const instance = { prompt: prompt || "" };

  if (mode === "edit" && originalPath && fs.existsSync(originalPath)) {
    const imgBuffer = fs.readFileSync(originalPath);
    instance.image = { bytesBase64Encoded: imgBuffer.toString("base64") };
  }

  const requestBody = {
    instances: [instance],
    parameters: {
      sampleCount: Math.min(Math.max(parseInt(imageCount, 10) || 1, 1), 4),
      aspectRatio,
      personGeneration: "allow_adult",
      safetySetting: "block_medium_and_above",
      outputOptions: {
        mimeType: "image/png",
        compressionQuality: quality === "high" ? 100 : quality === "medium" ? 80 : 60,
      },
    },
  };

  job.log(`[Vertex Imagen ${mode === "edit" ? "Edit" : "Generate"}] model=${safeModel} size=${imageSize} aspect=${aspectRatio}`);

  const response = await withRetry(async () => {
    return await axios.post(apiEndpoint, requestBody, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 180000,
    });
  }, job, `VertexImagen-${mode}`);

  const predictions = response.data?.predictions;
  if (!predictions || predictions.length === 0 || !predictions[0]?.bytesBase64Encoded) {
    throw new Error("Vertex AI did not return expected image data in response");
  }

  return predictions.map(p => Buffer.from(p.bytesBase64Encoded, "base64"));
}

module.exports = { vertexImagenPredict };
