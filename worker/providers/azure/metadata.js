"use strict";

const axios = require("axios");
const { getSetting, getAzureEndpoint, getAzureApiKey, getAzureApiVersion } = require("../../utils/settings");

/**
 * Azure OpenAI — generate video metadata (title, description, tags, hashtags)
 * from prompt and extracted video frames using Azure OpenAI vision deployment.
 *
 * @param {string} prompt Video transcript analysis prompt
 * @param {Array<{name: string, base64: string}>} frameBuffers Extracted video frames
 * @returns {Promise<string>} Raw LLM response string
 */
async function azureGenerateMetadata(prompt, frameBuffers = []) {
  const endpoint = getAzureEndpoint();
  const apiKey = getAzureApiKey();
  const apiVersion = getAzureApiVersion();
  const model = getSetting("azure_agent_model", "gpt-5.4-mini");

  if (!endpoint || !apiKey) {
    throw new Error("Azure Endpoint and API Key are required. Please set them in Settings under AI Provider Credentials.");
  }

  const messages = [{ role: "user", content: [] }];
  messages[0].content.push({ type: "text", text: prompt });

  for (const frame of frameBuffers) {
    messages[0].content.push({
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${frame.base64}`,
        detail: "low",
      },
    });
  }

  let chatUrl = endpoint.endsWith("/openai/v1")
    ? `${endpoint}/chat/completions`
    : `${endpoint}/openai/deployments/${model}/chat/completions?api-version=${apiVersion}`;

  const headers = { "Content-Type": "application/json" };
  if (endpoint.endsWith("/openai/v1")) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else {
    headers["api-key"] = apiKey;
  }

  const response = await axios.post(chatUrl, {
    messages,
    max_tokens: 2000,
    temperature: 0.7,
  }, {
    headers,
    timeout: 180000,
  });

  if (response.data?.error) {
    throw new Error(response.data.error.message || JSON.stringify(response.data.error));
  }

  return response.data.choices[0].message.content;
}

module.exports = { azureGenerateMetadata };
