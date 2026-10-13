"use strict";

const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const getDb = require("../../db");
const { verifyAuth, getAppSetting } = require("../../middleware/auth");

// ── Model & Provider registry (served to the frontend) ─────────────────────
const PROVIDERS = {
  openai:    { label: "OpenAI Direct",  description: "Official OpenAI GPT-Image models (Real-Time & Batch API)", icon: "⚡" },
  azure:     { label: "Azure OpenAI",   description: "GPT-Image models via Azure", icon: "☁️" },
  vertex:    { label: "Google Vertex AI", description: "Gemini image models via Vertex AI", icon: "🔮" },
  xai:       { label: "xAI (Grok)", description: "Grok Imagine models for image generation & style editing", icon: "⚡" },
};

const DEFAULT_MODELS = {
  "gpt-image-2": {
    provider: "openai", label: "GPT-Image-2", badge: "OpenAI Flagship", badgeColor: "#10a37f",
    description: "OpenAI Direct — 4K, reasoning-based high-fidelity photorealism, text rendering & inpainting edits",
    sizes: [
      { value: "1024x1024", label: "1024×1024 — Square (1:1)" },
      { value: "1536x1024", label: "1536×1024 — Landscape (3:2)" },
      { value: "1024x1536", label: "1024×1536 — Portrait (2:3)" },
      { value: "1088x1360", label: "1080×1350 — IG Portrait (4:5)" },
      { value: "1122x1402", label: "1122×1402 — Luxury Poster (4:5)" },
      { value: "1920x1088", label: "1920×1080 — Full HD (16:9)" },
      { value: "2048x2048", label: "2048×2048 — HD Square (1:1)" },
      { value: "2560x1440", label: "2560×1440 — 2K Landscape (16:9)" },
      { value: "1440x2560", label: "1440×2560 — 2K Portrait (9:16)" },
      { value: "3840x2160", label: "3840×2160 — 4K Landscape (16:9)" },
      { value: "2160x3840", label: "2160×3840 — 4K Portrait (9:16)" },
    ],
  },
  "gpt-image-2.5-flare": {
    provider: "openai", label: "GPT-Image 2.5 Flare", badge: "Fast & Efficient", badgeColor: "#0ea5e9",
    description: "OpenAI Direct — High-speed, cost-effective generation for rapid social and web assets",
    sizes: [
      { value: "1024x1024", label: "1024×1024 — Square (1:1)" },
      { value: "1536x1024", label: "1536×1024 — Landscape (3:2)" },
      { value: "1024x1536", label: "1024×1536 — Portrait (2:3)" },
      { value: "1920x1088", label: "1920×1080 — Full HD (16:9)" },
    ],
  },
  "gpt-image-2.5-sunburst": {
    provider: "openai", label: "GPT-Image 2.5 Sunburst", badge: "Premium Creative", badgeColor: "#d97706",
    description: "OpenAI Direct — Flagship premium creative model with state-of-the-art styling",
    sizes: [
      { value: "1024x1024", label: "1024×1024 — Square (1:1)" },
      { value: "1536x1024", label: "1536×1024 — Landscape (3:2)" },
      { value: "1024x1536", label: "1024×1536 — Portrait (2:3)" },
      { value: "1088x1360", label: "1080×1350 — IG Portrait (4:5)" },
      { value: "1920x1088", label: "1920×1080 — Full HD (16:9)" },
    ],
  },
  "azure-gpt-image-2": {
    provider: "azure", label: "GPT-Image-2 (Azure)", badge: "Azure GA", badgeColor: "#22c55e",
    description: "Azure OpenAI — 4K, realistic generation, broad aspect ratios & inpainting edit",
    sizes: [
      { value: "1024x1024", label: "1024×1024 — Square (1:1)" },
      { value: "1536x1024", label: "1536×1024 — Landscape (3:2)" },
      { value: "1600x900", label: "1600×900 — 16:9 HD" },
      { value: "1024x1536", label: "1024×1536 — Portrait (2:3)" },
      { value: "1920x1088", label: "1920×1080 — Full HD (16:9)" },
      { value: "1088x1360", label: "1080×1350 — IG Portrait (4:5)" },
      { value: "2048x2048", label: "2048×2048 — HD Square (1:1)" },
    ],
  },
  "azure-gpt-image-2.5-flare": {
    provider: "azure", label: "GPT-Image 2.5 Flare (Azure)", badge: "Azure Flare", badgeColor: "#0ea5e9",
    description: "Azure OpenAI — High-speed, cost-effective generation for rapid social and web assets",
    sizes: [
      { value: "1024x1024", label: "1024×1024 — Square (1:1)" },
      { value: "1536x1024", label: "1536×1024 — Landscape (3:2)" },
      { value: "1024x1536", label: "1024×1536 — Portrait (2:3)" },
      { value: "1088x1360", label: "1080×1350 — IG Portrait (4:5)" },
      { value: "1920x1088", label: "1920×1080 — Full HD (16:9)" },
    ],
  },
  "azure-gpt-image-2.5-sunburst": {
    provider: "azure", label: "GPT-Image 2.5 Sunburst (Azure)", badge: "Azure Sunburst", badgeColor: "#d97706",
    description: "Azure OpenAI — Flagship premium creative model with state-of-the-art styling",
    sizes: [
      { value: "1024x1024", label: "1024×1024 — Square (1:1)" },
      { value: "1536x1024", label: "1536×1024 — Landscape (3:2)" },
      { value: "1024x1536", label: "1024×1536 — Portrait (2:3)" },
      { value: "1088x1360", label: "1080×1350 — IG Portrait (4:5)" },
      { value: "1920x1088", label: "1920×1080 — Full HD (16:9)" },
    ],
  },
  "gemini-3.1-flash-image": {
    provider: "vertex", label: "Gemini 3.1 Flash Image", badge: "Vertex AI Image", badgeColor: "#10b981",
    description: "Google Vertex AI — High-speed native AI image generation & direct transformation",
    sizes: [
      { value: "1024x1024", label: "1024×1024 — Square (1:1)" },
      { value: "1536x1024", label: "1536×1024 — Landscape (3:2)" },
      { value: "1024x1536", label: "1024×1536 — Portrait (2:3)" },
      { value: "1920x1080", label: "1920×1080 — Full HD (16:9)" },
      { value: "1080x1920", label: "1080×1920 — Full HD (9:16)" },
      { value: "1080x1350", label: "1080×1350 — IG Portrait (4:5)" },
      { value: "2048x2048", label: "2048×2048 — HD Square (1:1)" },
    ],
  },
  "gemini-3-pro-image": {
    provider: "vertex", label: "Gemini 3 Pro Image", badge: "Vertex AI Pro Image", badgeColor: "#8b5cf6",
    description: "Google Vertex AI — Flagship high-fidelity AI image generation & inpainting",
    sizes: [
      { value: "1024x1024", label: "1024×1024 — Square (1:1)" },
      { value: "1536x1024", label: "1536×1024 — Landscape (3:2)" },
      { value: "1024x1536", label: "1024×1536 — Portrait (2:3)" },
      { value: "1920x1080", label: "1920×1080 — Full HD (16:9)" },
      { value: "1080x1920", label: "1080×1920 — Full HD (9:16)" },
      { value: "1080x1350", label: "1080×1350 — IG Portrait (4:5)" },
      { value: "2048x2048", label: "2048×2048 — 2K Square (1:1)" },
      { value: "2560x1440", label: "2560×1440 — 2K Landscape (16:9)" },
      { value: "3840x2160", label: "3840×2160 — 4K Landscape (16:9)" },
    ],
  },
  "grok-imagine-image-2.0": {
    provider: "xai", label: "Grok Imagine 2.0", badge: "xAI Flagship", badgeColor: "#000000",
    description: "xAI Imagine — High photorealism, style transfer & multi-turn inpainting edit ($0.04/img)",
    sizes: [
      { value: "1024x1024", label: "1024×1024 — Square (1:1)" },
      { value: "1536x1024", label: "1536×1024 — Landscape (3:2)" },
      { value: "1024x1536", label: "1024×1536 — Portrait (2:3)" },
      { value: "1920x1080", label: "1920×1080 — Full HD (16:9)" },
      { value: "1080x1920", label: "1080×1920 — Story / Reel (9:16)" },
      { value: "2048x2048", label: "2048×2048 — 2K Square (1:1)" },
    ],
  },
  "grok-imagine-image-quality": {
    provider: "xai", label: "Grok Imagine Quality", badge: "High Quality", badgeColor: "#6366f1",
    description: "xAI Imagine — Maximum fidelity and aesthetic quality generation ($0.05/img)",
    sizes: [
      { value: "1024x1024", label: "1024×1024 — Square (1:1)" },
      { value: "1536x1024", label: "1536×1024 — Landscape (3:2)" },
      { value: "1024x1536", label: "1024×1536 — Portrait (2:3)" },
      { value: "1920x1080", label: "1920×1080 — Full HD (16:9)" },
    ],
  },
  "grok-imagine-image": {
    provider: "xai", label: "Grok Imagine Fast", badge: "Fast & Affordable", badgeColor: "#14b8a6",
    description: "xAI Imagine — High-speed, affordable image generation ($0.02/img)",
    sizes: [
      { value: "1024x1024", label: "1024×1024 — Square (1:1)" },
      { value: "1536x1024", label: "1536×1024 — Landscape (3:2)" },
      { value: "1024x1536", label: "1024×1536 — Portrait (2:3)" },
      { value: "1920x1080", label: "1920×1080 — Full HD (16:9)" },
    ],
  },
};

module.exports = async function (fastify, opts) {
  // ── GET all settings ──────────────────────────────────────────────────────
  fastify.get("/images/settings", { preHandler: [verifyAuth] }, async (request, reply) => {
    const db = getDb();
    const rows = db.prepare("SELECT key, value FROM app_settings").all();
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    return settings;
  });

  // ── GET providers + models registry ──────────────────────────────────────
  const getProvidersHandler = async (request, reply) => {
    const db = getDb();

    const getVal = (k) => {
      try {
        const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(k);
        return row && row.value && row.value.trim().length > 0;
      } catch (_) {
        return false;
      }
    };

    const providers = {};
    for (const [key, meta] of Object.entries(PROVIDERS)) {
      let isConfigured = false;
      if (key === "openai") {
        isConfigured = Boolean(getVal("openai_api_key") || process.env.OPENAI_API_KEY);
      } else if (key === "azure") {
        isConfigured = Boolean((getVal("azure_api_key") || process.env.AZURE_API_KEY) && (getVal("azure_endpoint") || process.env.AZURE_ENDPOINT));
      } else if (key === "vertex") {
        isConfigured = Boolean(getVal("vertex_project_id") || getVal("vertex_sa_key") || (getVal("vertex_sa_file") && fs.existsSync(getVal("vertex_sa_file"))) || process.env.VERTEX_PROJECT_ID);
      } else if (key === "xai") {
        isConfigured = Boolean(getVal("xai_api_key") || process.env.XAI_API_KEY);
      } else if (key === "bedrock") {
        isConfigured = Boolean(getVal("aws_access_key_id") && getVal("aws_secret_access_key"));
      }
      providers[key] = {
        ...meta,
        configured: isConfigured,
      };
    }

    let models = { ...DEFAULT_MODELS };
    try {
      const customModelsRow = db.prepare("SELECT value FROM app_settings WHERE key = 'custom_models'").get();
      if (customModelsRow?.value) {
        const customModels = JSON.parse(customModelsRow.value);
        if (Array.isArray(customModels)) {
          customModels.forEach(m => {
            if (m.id) {
              models[m.id] = {
                provider: m.provider,
                label: m.label,
                badge: m.badge || "Custom",
                badgeColor: m.badgeColor || "#f59e0b",
                description: m.description,
                sizes: m.sizes || [{ value: "1024x1024", label: "1024×1024 — Square" }],
              };
            }
          });
        }
      }
    } catch (e) {
      console.error("Failed to parse custom models", e);
    }

    for (const [modelId, modelMeta] of Object.entries(models)) {
      models[modelId] = {
        ...modelMeta,
        configured: Boolean(providers[modelMeta.provider]?.configured),
      };
    }

    return { providers, models };
  };
  fastify.get("/settings/providers", { preHandler: [verifyAuth] }, getProvidersHandler);
  fastify.get("/images/settings/providers", { preHandler: [verifyAuth] }, getProvidersHandler);

  // ── POST save settings ────────────────────────────────────────────────────
  fastify.post("/images/settings", { preHandler: [verifyAuth] }, async (request, reply) => {
    const db = getDb();
    const settings = request.body || {};

    const upsert = db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);

    const updateMany = db.transaction((entries) => {
      for (const [key, value] of entries) upsert.run(key, String(value));
    });

    updateMany(Object.entries(settings));
    return { success: true, saved: Object.keys(settings).length };
  });

  // ── POST test provider connection ─────────────────────────────────────────
  fastify.post("/images/settings/test-provider", { preHandler: [verifyAuth] }, async (request, reply) => {
    const db = getDb();
    const { provider, credentials = {} } = request.body || {};

    if (!provider) return reply.code(400).send({ success: false, error: "Provider is required." });

    try {
      if (provider === "azure") {
        const endpoint = (credentials.azure_endpoint || getAppSetting(db, "azure_endpoint")).replace(/\/$/, "");
        const apiKey = credentials.azure_api_key || getAppSetting(db, "azure_api_key");
        const apiVersion = credentials.azure_api_version || getAppSetting(db, "azure_api_version") || "2025-04-01-preview";
        const agentModel = credentials.azure_agent_model || getAppSetting(db, "azure_agent_model") || "gpt-5.4-mini";

        if (!endpoint || !apiKey) return { success: false, error: "Azure Endpoint and API Key are required." };

        let baseEndpoint = endpoint;
        if (baseEndpoint.endsWith("/openai/v1")) {
          baseEndpoint = baseEndpoint.slice(0, -"/openai/v1".length);
        }
        baseEndpoint = baseEndpoint.replace(/\/$/, "");

        try {
          const res = await axios.get(`${baseEndpoint}/openai/v1/models`, {
            headers: { "api-key": apiKey },
            timeout: 10000,
          });
          if (res.status >= 200 && res.status < 300) {
            return { success: true, message: "Connected successfully to Azure OpenAI / AI Foundry!" };
          }
        } catch (_) {}

        let chatUrl, headers = { "Content-Type": "application/json", "api-key": apiKey };
        if (endpoint.endsWith("/openai/v1")) {
          chatUrl = `${endpoint}/chat/completions`;
          headers["Authorization"] = `Bearer ${apiKey}`;
        } else {
          chatUrl = `${baseEndpoint}/openai/deployments/${agentModel}/chat/completions?api-version=${apiVersion}`;
        }
        const res = await axios.post(chatUrl, { messages: [{ role: "user", content: "Test connection ping" }], max_completion_tokens: 5 }, { headers, timeout: 15000 });
        return res.status >= 200 && res.status < 300
          ? { success: true, message: "Connected successfully to Azure OpenAI!" }
          : { success: false, error: `Azure responded with status ${res.status}` };

      } else if (provider === "vertex") {
        const projectId = credentials.vertex_project_id || getAppSetting(db, "vertex_project_id");
        const location = credentials.vertex_location || getAppSetting(db, "vertex_location") || "global";
        const saKeyStr = credentials.vertex_sa_key || getAppSetting(db, "vertex_sa_key");
        const credFile = getAppSetting(db, "vertex_sa_file") || (fs.existsSync("/app/vertex-sa-key.json") ? "/app/vertex-sa-key.json" : null);

        if (!projectId) return { success: false, error: "Google Vertex AI Project ID is required." };

        let keyData = null;
        if (saKeyStr?.trim()) {
          const trimmed = saKeyStr.trim();
          keyData = trimmed.startsWith("{") ? JSON.parse(trimmed) : JSON.parse(Buffer.from(trimmed, "base64").toString("utf8"));
        } else if (credFile && fs.existsSync(credFile)) {
          keyData = JSON.parse(fs.readFileSync(credFile, "utf8"));
        }

        if (!keyData?.client_email || !keyData?.private_key) {
          return { success: false, error: "Valid Service Account JSON (or Service Account file) is required for Vertex AI." };
        }

        // Sign a JWT to obtain access token
        const header = { alg: "RS256", typ: "JWT" };
        const now = Math.floor(Date.now() / 1000);
        const claim = {
          iss: keyData.client_email,
          scope: "https://www.googleapis.com/auth/cloud-platform",
          aud: keyData.token_uri || "https://www.googleapis.com/oauth2/v4/token",
          exp: now + 3600, iat: now,
        };
        const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
        const toSign = `${b64(header)}.${b64(claim)}`;
        const signer = crypto.createSign("RSA-SHA256");
        signer.update(toSign);
        const jwtToken = `${toSign}.${signer.sign(keyData.private_key, "base64url")}`;

        const tokenRes = await axios.post(keyData.token_uri || "https://www.googleapis.com/oauth2/v4/token",
          { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwtToken },
          { timeout: 15000 }
        );
        return tokenRes.data?.access_token
          ? { success: true, message: `Connected to Google Vertex AI (Project: ${projectId}, Location: ${location})!` }
          : { success: false, error: "Failed to obtain access token from Google OAuth2 server." };

      } else if (provider === "openai") {
        const apiKey = credentials.openai_api_key || getAppSetting(db, "openai_api_key");
        const baseUrl = (credentials.openai_base_url || getAppSetting(db, "openai_base_url") || "https://api.openai.com/v1").replace(/\/$/, "");
        if (!apiKey) return { success: false, error: "OpenAI API Key is required." };

        const res = await axios.get(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 15000 });
        if (res.status === 200) {
          const models = (res.data?.data || []).map(m => m.id);
          const hasGptImage = models.some(m => m.includes("gpt-image"));
          return { success: true, message: `Connected to OpenAI! (${models.length} models, GPT-Image: ${hasGptImage ? "Active" : "Standard"})` };
        }
        return { success: false, error: `OpenAI responded with status ${res.status}` };

      } else if (provider === "xai") {
        const apiKey = credentials.xai_api_key || getAppSetting(db, "xai_api_key");
        const baseUrl = (credentials.xai_base_url || getAppSetting(db, "xai_base_url") || "https://api.x.ai/v1").replace(/\/$/, "");
        if (!apiKey) return { success: false, error: "xAI API Key is required." };
        const res = await axios.get(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 15000 });
        return res.status === 200
          ? { success: true, message: "Connected successfully to xAI (Grok)!" }
          : { success: false, error: `xAI responded with status ${res.status}` };

      } else if (provider === "bedrock") {
        const accessKey = credentials.aws_access_key_id || getAppSetting(db, "aws_access_key_id");
        const secretKey = credentials.aws_secret_access_key || getAppSetting(db, "aws_secret_access_key");
        const region = credentials.aws_region || getAppSetting(db, "aws_region") || "us-east-1";
        if (!accessKey || !secretKey) return { success: false, error: "AWS Access Key ID and Secret Access Key are required." };
        return { success: true, message: `AWS Bedrock credentials configured for region ${region}!` };

      } else {
        return { success: false, error: `Unknown provider: ${provider}` };
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error?.message || err.response?.data?.error || err.message || "Connection test failed.";
      return { success: false, error: errorMsg };
    }
  });
};
