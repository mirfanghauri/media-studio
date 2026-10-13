"use strict";

const axios = require("axios");
const { getSetting } = require("../../utils/settings");
const { signV4 } = require("./auth");

/**
 * AWS Bedrock (Claude Messages API) — generate video metadata (title, description, tags, hashtags)
 * from prompt and extracted video frames.
 *
 * @param {string} prompt Video transcript analysis prompt
 * @param {Array<{name: string, base64: string}>} frameBuffers Extracted video frames
 * @returns {Promise<string>} Raw LLM response string
 */
async function bedrockGenerateMetadata(prompt, frameBuffers = []) {
  const accessKey = getSetting("aws_access_key_id");
  const secretKey = getSetting("aws_secret_access_key");
  const region = getSetting("aws_region", "us-east-1");
  const modelId = getSetting("bedrock_model", "anthropic.claude-3-haiku-20240307-v1:0");

  if (!accessKey || !secretKey) {
    throw new Error("AWS Access Key ID and Secret Access Key are required for Bedrock. Please set them in Settings.");
  }

  const content = [{ type: "text", text: prompt }];

  for (const frame of frameBuffers) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: frame.base64,
      },
    });
  }

  const requestBody = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 2000,
    messages: [{ role: "user", content }],
    temperature: 0.7,
  });

  const hostname = `bedrock-runtime.${region}.amazonaws.com`;
  const urlPath = `/model/${encodeURIComponent(modelId)}/invoke`;

  const signedHeaders = signV4({
    method: "POST",
    hostname,
    path: urlPath,
    headers: { "Content-Type": "application/json" },
    body: requestBody,
    region,
    service: "bedrock",
    accessKey,
    secretKey,
  });

  const response = await axios.post(`https://${hostname}${urlPath}`, requestBody, {
    headers: signedHeaders,
    timeout: 180000,
  });

  if (response.data?.error) {
    throw new Error(JSON.stringify(response.data.error));
  }

  const text = response.data.content?.[0]?.text || response.data.completion || "";
  return text;
}

module.exports = { bedrockGenerateMetadata };
