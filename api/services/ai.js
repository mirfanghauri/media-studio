"use strict";

const fs = require("fs");
const path = require("path");
const { getSetting } = require("../worker/utils/settings");

// Modular Provider Callers
const { openaiGenerateMetadata } = require("../worker/providers/openai");
const { azureGenerateMetadata } = require("../worker/providers/azure");
const { vertexGenerateMetadata } = require("../worker/providers/vertex");
const { bedrockGenerateMetadata } = require("../worker/providers/bedrock");

/**
 * Generate YouTube metadata from transcript and frames using AI.
 */
async function generateMetadata({ framesDir, frames, transcript, aiProvider }) {
  const fullText = transcript.map((s) => s.text).join(" ");

  // Select up to 6 evenly-spaced frames for vision analysis
  const selectedFrames = selectFrames(frames, 6);
  const frameBuffers = selectedFrames.map((f) => ({
    name: f,
    base64: fs.readFileSync(path.join(framesDir, f)).toString("base64"),
  }));

  const prompt = buildPrompt(fullText);

  let rawResponse;
  switch ((aiProvider || "").toLowerCase()) {
    case "bedrock":
      rawResponse = await callWithFallback(bedrockGenerateMetadata, prompt, frameBuffers);
      break;
    case "azure":
    case "azure_openai":
      rawResponse = await callWithFallback(azureGenerateMetadata, prompt, frameBuffers);
      break;
    case "vertex":
    case "google":
    case "gemini":
      rawResponse = await callWithFallback(vertexGenerateMetadata, prompt, frameBuffers);
      break;
    case "openai":
    default:
      rawResponse = await callWithFallback(openaiGenerateMetadata, prompt, frameBuffers);
      break;
  }

  return parseAIResponse(rawResponse);
}

// Try with vision first, fall back to text-only if images not supported
async function callWithFallback(callFn, prompt, frameBuffers) {
  try {
    return await callFn(prompt, frameBuffers);
  } catch (err) {
    const msg = err.message || "";
    if (msg.includes("image") || msg.includes("Image") || msg.includes("vision") || msg.includes("multimodal")) {
      console.log(`Vision not supported, retrying text-only: ${msg.substring(0, 100)}`);
      return await callFn(prompt, []);
    }
    throw err;
  }
}

function selectFrames(frames, count) {
  if (!frames || frames.length <= count) return frames || [];
  const step = Math.floor(frames.length / count);
  return Array.from({ length: count }, (_, i) => frames[i * step]);
}

function buildPrompt(transcript) {
  const customTemplate = getSetting("video_metadata_prompt_template");
  if (customTemplate && customTemplate.trim() !== "") {
    if (customTemplate.includes("{transcript}")) {
      return customTemplate.replace("{transcript}", transcript.substring(0, 8000));
    }
    return `${customTemplate}\n\nVIDEO TRANSCRIPT:\n${transcript.substring(0, 8000)}`;
  }

  return `You are a YouTube SEO expert. Analyze this video content and generate optimized YouTube metadata.

VIDEO TRANSCRIPT:
${transcript.substring(0, 8000)}

Based on the transcript and the provided video frames, generate:

1. **Title**: A compelling, click-worthy title (max 100 chars). Include primary keyword naturally.
2. **Description**: SEO-optimized description (300-500 words) with:
   - Hook in first 2 lines (shown before "Show More")
   - Key timestamps if applicable
   - Relevant keywords naturally woven in
   - Call to action
3. **Tags**: 15-25 relevant tags, mix of broad and specific
4. **Category**: Best YouTube category
5. **Thumbnail Text**: Suggested text overlay for thumbnail (max 5 words)

Respond in this exact JSON format:
{
  "title": "...",
  "description": "...",
  "tags": ["tag1", "tag2", ...],
  "category": "...",
  "thumbnailText": "...",
  "hashtags": ["#tag1", "#tag2", "#tag3"]
}

Respond ONLY with valid JSON, no markdown or extra text.`;
}

function parseAIResponse(text) {
  if (typeof text !== "string") {
    if (typeof text === "object" && text !== null) return text;
    return {
      title: "Untitled Video",
      description: "",
      tags: [],
      category: "Entertainment",
      thumbnailText: "",
      hashtags: [],
      _raw: String(text),
    };
  }

  let cleaned = text.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    cleaned = jsonMatch[1].trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    return {
      title: "Untitled Video",
      description: cleaned.substring(0, 500),
      tags: [],
      category: "Entertainment",
      thumbnailText: "",
      hashtags: [],
      _raw: cleaned,
    };
  }
}

module.exports = {
  generateMetadata,
  selectFrames,
  buildPrompt,
  parseAIResponse,
  callWithFallback,
};
