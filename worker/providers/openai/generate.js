"use strict";

const axios = require("axios");
const { getOpenAIApiKey, getOpenAIBaseUrl, getOpenAIDefaultImageModel } = require("../../utils/settings");
const { withRetry } = require("../../utils/retry");
const { validateSize } = require("../../utils/image");

/**
 * OpenAI Direct — real-time text-to-image generation.
 *
 * @param {object} job     BullMQ job
 * @param {object} jobData Job data payload
 * @returns {Buffer[]}
 */
async function openaiGenerate(job, jobData) {
  const { prompt, model, imageSize, quality, imageCount } = jobData;
  const apiKey = getOpenAIApiKey();
  const baseUrl = getOpenAIBaseUrl();
  const safeModel = model || getOpenAIDefaultImageModel();
  const safeSize = validateSize(safeModel, imageSize);

  if (!apiKey) {
    throw new Error("OpenAI API key missing. Please set OPENAI_API_KEY in Settings or environment.");
  }

  const generateUrl = `${baseUrl}/images/generations`;
  job.log(`[OpenAI Generate] model=${safeModel} size=${safeSize} quality=${quality}`);

  const requestBody = {
    model: safeModel,
    prompt,
    n: Math.min(Math.max(parseInt(imageCount, 10) || 1, 1), 10),
    size: safeSize,
    quality: quality || "medium",
    output_format: "png",
  };

  const response = await withRetry(async () => {
    return await axios.post(generateUrl, requestBody, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 180000,
    });
  }, job, "OpenAI-Generate");

  if (!response.data?.data?.[0]?.b64_json) {
    throw new Error("OpenAI did not return expected b64_json in generation response");
  }

  if (response.data.usage) {
    job.data.usageTokens = response.data.usage;
  }

  return response.data.data.map(item => Buffer.from(item.b64_json, "base64"));
}

module.exports = { openaiGenerate };
