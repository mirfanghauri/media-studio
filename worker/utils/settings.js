"use strict";

const getDb = require("../db");

/**
 * Read a setting directly from SQLite app_settings with an optional default value.
 */
function getSetting(key, defaultValue = "") {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
    if (row && row.value && row.value.trim() !== "") {
      return row.value.trim();
    }
  } catch (_) {}
  return defaultValue;
}

// ── Azure OpenAI ──────────────────────────────────────────────────────────────
function getAzureEndpoint() {
  return getSetting("azure_endpoint").replace(/\/$/, "");
}
function getAzureApiKey() {
  return getSetting("azure_api_key");
}
function getAzureApiVersion() {
  return getSetting("azure_api_version", "2025-04-01-preview");
}
function getAzureAgentModel() {
  return getSetting("azure_agent_model", "gpt-5.4-mini");
}
function getAzureImageModel() {
  return getSetting("azure_image_model", "gpt-image-2");
}

// ── Google Vertex AI ──────────────────────────────────────────────────────────
function getVertexProjectId() {
  return getSetting("vertex_project_id");
}
function getVertexLocation() {
  return getSetting("vertex_location", "global");
}

// ── OpenAI Direct ─────────────────────────────────────────────────────────────
function getOpenAIApiKey() {
  return getSetting("openai_api_key");
}
function getOpenAIBaseUrl() {
  return getSetting("openai_base_url", "https://api.openai.com/v1").replace(/\/$/, "");
}
function getOpenAIDefaultImageModel() {
  return getSetting("openai_image_model", "gpt-image-2");
}

// ── xAI Grok Imagine ─────────────────────────────────────────────────────────
function getXAIApiKey() {
  return getSetting("xai_api_key");
}
function getXAIBaseUrl() {
  return getSetting("xai_base_url", "https://api.x.ai/v1").replace(/\/$/, "");
}
function getXAIDefaultImageModel() {
  return getSetting("xai_image_model", "grok-imagine-image-2.0");
}

module.exports = {
  getSetting,
  getAzureEndpoint,
  getAzureApiKey,
  getAzureApiVersion,
  getAzureAgentModel,
  getAzureImageModel,
  getVertexProjectId,
  getVertexLocation,
  getOpenAIApiKey,
  getOpenAIBaseUrl,
  getOpenAIDefaultImageModel,
  getXAIApiKey,
  getXAIBaseUrl,
  getXAIDefaultImageModel,
};
