"use strict";

const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const { getOpenAIApiKey, getOpenAIBaseUrl, getOpenAIDefaultImageModel } = require("../../utils/settings");
const { withRetry } = require("../../utils/retry");
const { validateSize } = require("../../utils/image");

/**
 * OpenAI Direct — real-time multipart image edit.
 *
 * @param {object} job     BullMQ job
 * @param {object} jobData Job data payload
 * @returns {Buffer[]}
 */
async function openaiEdit(job, jobData) {
  const { originalPath, prompt, model, imageSize, quality, imageCount } = jobData;
  const apiKey = getOpenAIApiKey();
  const baseUrl = getOpenAIBaseUrl();
  const safeModel = model || getOpenAIDefaultImageModel();
  const safeSize = validateSize(safeModel, imageSize);

  if (!apiKey) {
    throw new Error("OpenAI API key missing. Please set OPENAI_API_KEY in Settings or environment.");
  }

  const editUrl = `${baseUrl}/images/edits`;
  job.log(`[OpenAI Edit] model=${safeModel} size=${safeSize} quality=${quality} url=${editUrl}`);

  const response = await withRetry(async () => {
    const form = new FormData();
    form.append("model", safeModel);
    form.append("image", fs.createReadStream(originalPath));
    form.append("prompt", prompt);
    form.append("n", String(Math.min(Math.max(parseInt(imageCount, 10) || 1, 1), 10)));
    form.append("size", safeSize);
    form.append("quality", quality || "medium");
    form.append("output_format", "png");

    return await axios.post(editUrl, form, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        ...form.getHeaders(),
      },
      timeout: 180000,
    });
  }, job, "OpenAI-Edit");

  if (!response.data?.data?.[0]?.b64_json) {
    throw new Error("OpenAI did not return expected b64_json in edit response");
  }

  if (response.data.usage) {
    job.data.usageTokens = response.data.usage;
  }

  return response.data.data.map(item => Buffer.from(item.b64_json, "base64"));
}

module.exports = { openaiEdit };
