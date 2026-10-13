"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { getXAIApiKey, getXAIBaseUrl, getXAIDefaultImageModel } = require("../../utils/settings");
const { withRetry } = require("../../utils/retry");
const { extractImageBuffers } = require("./generate");

/**
 * Determine MIME type based on file extension.
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

/**
 * xAI Grok Imagine — real-time image editing / transformation.
 * According to xAI documentation, image editing requires application/json
 * with the image passed as a base64 Data URI (OpenAI multipart is NOT supported).
 *
 * @param {object} job     BullMQ job
 * @param {object} jobData Job data payload
 * @returns {Buffer[]}
 */
async function xaiEdit(job, jobData) {
  const { originalPath, prompt, model, imageCount } = jobData;
  const apiKey = getXAIApiKey();
  const baseUrl = getXAIBaseUrl();
  const safeModel = model || getXAIDefaultImageModel();

  if (!apiKey) {
    throw new Error("xAI API key missing. Please set xAI API Key in Settings under AI Provider Credentials.");
  }

  if (!originalPath || !fs.existsSync(originalPath)) {
    throw new Error(`Original image file not found for xAI editing: ${originalPath}`);
  }

  const editUrl = `${baseUrl}/images/edits`;
  job.log(`[xAI Edit] model=${safeModel} url=${editUrl}`);

  const imageBuffer = fs.readFileSync(originalPath);
  const base64Image = imageBuffer.toString("base64");
  const mimeType = getMimeType(originalPath);
  const dataUri = `data:${mimeType};base64,${base64Image}`;

  const requestBody = {
    model: safeModel,
    prompt,
    image: {
      url: dataUri,
      type: "image_url",
    },
    n: Math.min(Math.max(parseInt(imageCount, 10) || 1, 1), 4),
    response_format: "b64_json",
  };

  const response = await withRetry(async () => {
    return await axios.post(editUrl, requestBody, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 180000,
    });
  }, job, "xAI-Edit");

  if (response.data?.usage) {
    job.data.usageTokens = response.data.usage;
  }

  return await extractImageBuffers(response.data);
}

module.exports = { xaiEdit };
