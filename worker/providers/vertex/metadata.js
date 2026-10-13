"use strict";

const axios = require("axios");
const { getSetting, getVertexProjectId, getVertexLocation } = require("../../utils/settings");
const { getVertexAccessToken } = require("./auth");

/**
 * Google Vertex AI (Gemini Multimodal) — generate video metadata (title, description, tags, hashtags)
 * from prompt and extracted video frames.
 *
 * @param {string} prompt Video transcript analysis prompt
 * @param {Array<{name: string, base64: string}>} frameBuffers Extracted video frames
 * @returns {Promise<string>} Raw LLM response string
 */
async function vertexGenerateMetadata(prompt, frameBuffers = []) {
  const projectId = getVertexProjectId();
  const location = getVertexLocation();
  const model = getSetting("vertex_video_model", "gemini-2.5-flash");

  if (!projectId) {
    throw new Error("Google Vertex AI Project ID is required. Please set it in Settings under AI Provider Credentials.");
  }

  const accessToken = await getVertexAccessToken();

  const host = location === "global"
    ? "aiplatform.googleapis.com"
    : `${location}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1beta1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

  const parts = [{ text: prompt }];
  for (const frame of frameBuffers) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: frame.base64,
      },
    });
  }

  const response = await axios.post(url, {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    },
  }, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    timeout: 180000,
  });

  if (response.data?.error) {
    throw new Error(response.data.error.message || JSON.stringify(response.data.error));
  }

  const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return text;
}

module.exports = { vertexGenerateMetadata };
