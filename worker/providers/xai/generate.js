"use strict";

const axios = require("axios");
const { getXAIApiKey, getXAIBaseUrl, getXAIDefaultImageModel } = require("../../utils/settings");
const { withRetry } = require("../../utils/retry");

/**
 * Helper to compute aspect ratio from size string (e.g. 1024x1024 -> 1:1, 1920x1080 -> 16:9).
 */
function getAspectRatio(sizeStr) {
  if (!sizeStr) return null;
  const [w, h] = sizeStr.split("x").map(Number);
  if (!w || !h) return null;
  const ratio = w / h;
  if (Math.abs(ratio - 1) < 0.05) return "1:1";
  if (Math.abs(ratio - 16 / 9) < 0.05) return "16:9";
  if (Math.abs(ratio - 9 / 16) < 0.05) return "9:16";
  if (Math.abs(ratio - 3 / 2) < 0.05) return "3:2";
  if (Math.abs(ratio - 2 / 3) < 0.05) return "2:3";
  if (Math.abs(ratio - 4 / 3) < 0.05) return "4:3";
  if (Math.abs(ratio - 3 / 4) < 0.05) return "3:4";
  return null;
}

/**
 * Extract image buffers from xAI response supporting b64_json and url fallback.
 */
async function extractImageBuffers(responseData) {
  if (!responseData?.data || !Array.isArray(responseData.data) || responseData.data.length === 0) {
    throw new Error("xAI did not return image data in the response: " + JSON.stringify(responseData));
  }
  const buffers = [];
  for (const item of responseData.data) {
    if (item.b64_json) {
      buffers.push(Buffer.from(item.b64_json, "base64"));
    } else if (item.url) {
      const imgRes = await axios.get(item.url, { responseType: "arraybuffer", timeout: 60000 });
      buffers.push(Buffer.from(imgRes.data));
    } else {
      throw new Error("xAI image item has neither b64_json nor url");
    }
  }
  return buffers;
}

/**
 * xAI Grok Imagine — real-time text-to-image generation.
 *
 * @param {object} job     BullMQ job
 * @param {object} jobData Job data payload
 * @returns {Buffer[]}
 */
async function xaiGenerate(job, jobData) {
  const { prompt, model, imageSize, imageCount } = jobData;
  const apiKey = getXAIApiKey();
  const baseUrl = getXAIBaseUrl();
  const safeModel = model || getXAIDefaultImageModel();

  if (!apiKey) {
    throw new Error("xAI API key missing. Please set xAI API Key in Settings under AI Provider Credentials.");
  }

  const generateUrl = `${baseUrl}/images/generations`;
  job.log(`[xAI Generate] model=${safeModel} size=${imageSize}`);

  const requestBody = {
    model: safeModel,
    prompt,
    n: Math.min(Math.max(parseInt(imageCount, 10) || 1, 1), 4),
    response_format: "b64_json",
  };

  const ar = getAspectRatio(imageSize);
  if (ar) {
    requestBody.aspect_ratio = ar;
  }

  const response = await withRetry(async () => {
    return await axios.post(generateUrl, requestBody, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 180000,
    });
  }, job, "xAI-Generate");

  if (response.data?.usage) {
    job.data.usageTokens = response.data.usage;
  }

  return await extractImageBuffers(response.data);
}

module.exports = { xaiGenerate, extractImageBuffers };
