"use strict";

const axios = require("axios");
const { getAzureEndpoint, getAzureApiKey, getAzureImageModel } = require("../../utils/settings");
const { withRetry } = require("../../utils/retry");
const { validateSize } = require("../../utils/image");

/**
 * Azure OpenAI — text-to-image generation via /openai/v1/images/generations.
 *
 * @param {object} job     BullMQ job
 * @param {object} jobData Job data payload
 * @returns {Buffer[]}
 */
async function azureGenerate(job, jobData) {
  const { prompt, model, imageSize, quality, imageCount } = jobData;

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

  const generateUrl = `${baseEndpoint}/openai/v1/images/generations`;

  job.log(`[Azure Generate] deployment=${safeModel} size=${safeSize} quality=${quality} url=${generateUrl}`);

  const isDalle = safeModel.toLowerCase().includes("dall-e");
  const requestBody = isDalle
    ? {
        model: safeModel,
        prompt,
        n: 1,
        size: safeSize === "1024x1024" || safeSize === "1024x1792" || safeSize === "1792x1024" ? safeSize : "1024x1024",
        quality: quality === "high" ? "hd" : "standard",
        response_format: "b64_json",
      }
    : {
        model: safeModel,
        prompt,
        n: Math.min(Math.max(parseInt(imageCount, 10) || 1, 1), 10),
        size: safeSize,
        quality: quality || "high",
        output_format: "png",
      };

  const response = await withRetry(async () => {
    return await axios.post(generateUrl, requestBody, {
      headers: { "api-key": getAzureApiKey(), "Content-Type": "application/json" },
      timeout: 180000,
    });
  }, job, "AzureGenerate");

  if (!response.data?.data?.[0]?.b64_json) {
    throw new Error("Azure did not return expected b64_json in generation response");
  }

  if (response.data.usage) {
    job.data.usageTokens = response.data.usage;
  }

  return response.data.data.map(item => Buffer.from(item.b64_json, "base64"));
}

module.exports = { azureGenerate };
