"use strict";

const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const { getAzureEndpoint, getAzureApiKey, getAzureImageModel } = require("../../utils/settings");
const { withRetry } = require("../../utils/retry");
const { validateSize } = require("../../utils/image");

/**
 * Azure OpenAI — image edit (inpainting / variation) via /openai/v1/images/edits.
 *
 * @param {object} job     BullMQ job
 * @param {object} jobData Job data payload
 * @returns {Buffer[]}
 */
async function azureEdit(job, jobData) {
  const { originalPath, prompt, model, imageSize, quality, imageCount } = jobData;

  // Resolve deployment name: map UI keys like 'azure-gpt-image-2' to actual Azure deployment name
  const configuredModel = getAzureImageModel();
  let safeModel;
  if (!model || model === "azure") {
    safeModel = configuredModel || "gpt-image-2";
  } else if (typeof model === "string" && model.startsWith("azure-")) {
    safeModel = model.replace(/^azure-/, "");
  } else {
    safeModel = model || configuredModel || "gpt-image-2";
  }

  const safeSize = validateSize(safeModel, imageSize);

  let baseEndpoint = getAzureEndpoint();
  if (!baseEndpoint) {
    throw new Error("Azure OpenAI endpoint is not configured. Please set azure_endpoint in Settings.");
  }
  if (baseEndpoint.endsWith("/openai/v1")) {
    baseEndpoint = baseEndpoint.slice(0, -"/openai/v1".length);
  }
  baseEndpoint = baseEndpoint.replace(/\/$/, "");

  const editUrl = `${baseEndpoint}/openai/v1/images/edits`;

  job.log(`[Azure Edit] deployment=${safeModel} size=${safeSize} quality=${quality} url=${editUrl}`);

  const response = await withRetry(async () => {
    const form = new FormData();
    form.append("model", safeModel);
    form.append("image", fs.createReadStream(originalPath));
    form.append("prompt", prompt);
    form.append("n", String(Math.min(Math.max(parseInt(imageCount, 10) || 1, 1), 10)));
    form.append("size", safeSize);
    form.append("quality", quality || "high");
    form.append("output_format", "png");

    return await axios.post(editUrl, form, {
      headers: { "api-key": getAzureApiKey(), ...form.getHeaders() },
      timeout: 180000,
    });
  }, job, "AzureEdit");

  if (!response.data?.data?.[0]?.b64_json) {
    throw new Error("Azure did not return expected b64_json in edit response");
  }

  if (response.data.usage) {
    job.data.usageTokens = response.data.usage;
  }

  return response.data.data.map(item => Buffer.from(item.b64_json, "base64"));
}

module.exports = { azureEdit };
