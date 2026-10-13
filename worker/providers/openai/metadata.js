"use strict";

const axios = require("axios");
const { getSetting, getOpenAIApiKey, getOpenAIBaseUrl } = require("../../utils/settings");

/**
 * OpenAI Direct — generate video metadata (title, description, tags, hashtags)
 * from prompt and extracted video frames using GPT-4o / GPT-4o-mini vision.
 *
 * @param {string} prompt Video transcript analysis prompt
 * @param {Array<{name: string, base64: string}>} frameBuffers Extracted video frames
 * @returns {Promise<string>} Raw LLM response string
 */
async function openaiGenerateMetadata(prompt, frameBuffers = []) {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error("OpenAI API key is required. Please set it in Settings under AI Provider Credentials.");
  }

  const baseUrl = getOpenAIBaseUrl();
  const model = frameBuffers.length > 0
    ? getSetting("openai_vision_model", "gpt-4o-mini")
    : getSetting("openai_text_model", "gpt-4o-mini");

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

  const response = await axios.post(`${baseUrl}/chat/completions`, {
    model,
    messages,
    max_tokens: 2000,
    temperature: 0.7,
  }, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    timeout: 180000,
  });

  if (response.data?.error) {
    throw new Error(response.data.error.message || JSON.stringify(response.data.error));
  }

  return response.data.choices[0].message.content;
}

module.exports = { openaiGenerateMetadata };
