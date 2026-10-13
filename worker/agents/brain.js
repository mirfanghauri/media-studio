"use strict";

const axios = require("axios");
const { getAzureEndpoint, getAzureApiKey, getAzureApiVersion, getAzureAgentModel } = require("../utils/settings");
const { withRetry } = require("../utils/retry");

/**
 * Image Agent Brain — Azure-hosted LLM orchestrator.
 * Analyses the user's intent and input image, then returns:
 *   - masterPrompt: enriched generation prompt
 *   - routing: which provider to use (azure | vertex | openai)
 *   - routingReason: explanation
 *   - transformations: resize, outputFormat, quality, applyLogo
 *
 * @param {object}  job         BullMQ job
 * @param {object}  jobData     Job data payload
 * @param {Buffer|null} imageBuffer  Optional input image for vision
 * @returns {object} Agent decision JSON
 */
async function invokeImageAgentBrain(job, jobData, imageBuffer) {
  const agentModel = getAzureAgentModel();
  const endpoint = getAzureEndpoint();
  const apiKey = getAzureApiKey();

  let chatUrl;
  let headers = { "Content-Type": "application/json" };
  let isServerlessEndpoint = false;

  if (endpoint.endsWith("/openai/v1")) {
    chatUrl = `${endpoint}/chat/completions`;
    headers["Authorization"] = `Bearer ${apiKey}`;
    isServerlessEndpoint = true;
  } else {
    let baseEndpoint = endpoint.replace(/\/$/, "");
    chatUrl = `${baseEndpoint}/openai/deployments/${agentModel}/chat/completions?api-version=${getAzureApiVersion()}`;
    headers["api-key"] = apiKey;
  }

  const messages = [
    {
      role: "system",
      content: `You are the Image Agent Brain orchestrator. Your job is to analyze the user's intent and image (if provided).
Output a JSON object with the following schema:
{
  "masterPrompt": "Highly detailed, expanded prompt for image generation.",
  "routing": "azure" or "vertex" or "openai",
  "routingReason": "Why you chose this routing.",
  "transformations": {
    "resize": "1920x1088",
    "outputFormat": "webp",
    "quality": "high",
    "applyLogo": true
  }
}
Route to "azure" for photorealistic photography, text rendering, clean layouts, and enterprise assets.
Route to "vertex" for conceptual art, complex scenes, and multimodal editing.
Route to "openai" for general creative imagery and styles.
Keep transformations reasonable and strictly follow the requested output.`,
    },
    {
      role: "user",
      content: [
        { type: "text", text: `User Prompt: ${jobData.prompt || "Edit this image"}` },
      ],
    },
  ];

  if (imageBuffer) {
    const b64 = imageBuffer.toString("base64");
    messages[1].content.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${b64}` },
    });
  }

  job.log(`[Agent Brain] Invoking orchestrator using model ${agentModel}...`);

  const payload = {
    messages,
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 1500,
  };

  if (isServerlessEndpoint) {
    payload.model = agentModel;
  }

  const response = await withRetry(async () => {
    return await axios.post(chatUrl, payload, { headers, timeout: 180000 });
  }, job, "AgentBrain");

  const resultText = response.data?.choices?.[0]?.message?.content;
  if (!resultText) throw new Error("Agent Brain did not return expected content");

  try {
    return JSON.parse(resultText);
  } catch (err) {
    throw new Error("Failed to parse Agent Brain JSON output: " + err.message);
  }
}

module.exports = { invokeImageAgentBrain };
