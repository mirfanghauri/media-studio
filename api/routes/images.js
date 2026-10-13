"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const archiver = require("archiver");
const { Queue } = require("bullmq");
const getDb = require("../db");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, "..", "..", "storage");
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// Setup BullMQ for image processing
const imageQueue = new Queue("image-processing", {
  connection: {
    host: process.env.REDIS_HOST || "redis",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
  },
});

async function verifyAuth(req, reply) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing or invalid authorization header" });
    }
    const token = authHeader.split(" ")[1];
    jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}

function getAppSetting(db, key, envFallbackKey = "") {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
    if (row && row.value && row.value.trim() !== "") {
      return row.value.trim();
    }
  } catch (_) { }
  if (envFallbackKey && process.env[envFallbackKey]) {
    return process.env[envFallbackKey].trim();
  }
  return "";
}

module.exports = async function (fastify, opts) {

    // ─────────────────────────────────────────────────────────────────────────
    // AUTH
    // ─────────────────────────────────────────────────────────────────────────
    fastify.post("/auth/login", async (request, reply) => {
      const { password } = request.body || {};
      const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

      const timingSafeEqualCheck = (a, b) => {
        if (typeof a !== "string" || typeof b !== "string") return false;
        const hA = crypto.createHash("sha256").update(a).digest();
        const hB = crypto.createHash("sha256").update(b).digest();
        return crypto.timingSafeEqual(hA, hB);
      };

      if (!password || !timingSafeEqualCheck(password, adminPassword)) {
        return reply.code(401).send({ error: "Invalid password" });
      }

      const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "72h" });
      return { token };
    });

    // ─────────────────────────────────────────────────────────────────────────
    // BRAND LOGO — UPLOAD & SERVE
    // ─────────────────────────────────────────────────────────────────────────
    fastify.post("/images/logo/upload", { preHandler: [verifyAuth] }, async (request, reply) => {
      const logosDir = path.join(STORAGE_PATH, "logos");
      fs.mkdirSync(logosDir, { recursive: true });

      const parts = request.parts();
      let savedPath = null;

      for await (const part of parts) {
        if (part.type === "file") {
          const ext = path.extname(part.filename).toLowerCase();
          const allowed = [".png", ".jpg", ".jpeg", ".webp", ".svg"];
          if (!allowed.includes(ext)) {
            return reply.code(400).send({ error: "Logo must be PNG, JPG, WEBP or SVG" });
          }
          const filename = `brand_logo${ext}`;
          savedPath = path.join(logosDir, filename);
          await new Promise((resolve, reject) => {
            const stream = fs.createWriteStream(savedPath);
            part.file.pipe(stream);
            part.file.on("end", resolve);
            part.file.on("error", reject);
          });
        }
      }

      if (!savedPath) return reply.code(400).send({ error: "No file uploaded" });

      // Save path to settings
      const db = getDb();
      db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES ('brand_logo_path', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(savedPath);

      return { success: true, path: savedPath, url: `/api/images/logo/serve` };
    });

    // Serve the current brand logo for preview in the UI
    fastify.get("/images/logo/serve", async (request, reply) => {
      const db = getDb();
      const row = db.prepare("SELECT value FROM app_settings WHERE key = 'brand_logo_path'").get();
      if (!row || !row.value || !fs.existsSync(row.value)) {
        return reply.code(404).send({ error: "No logo uploaded" });
      }
      const ext = path.extname(row.value).toLowerCase();
      const contentType = ext === ".svg" ? "image/svg+xml" :
        ext === ".png" ? "image/png" :
          ext === ".webp" ? "image/webp" : "image/jpeg";
      reply.header("Content-Type", contentType);
      reply.header("Cache-Control", "no-cache");
      return reply.send(fs.createReadStream(row.value));
    });

    // Delete the brand logo
    fastify.delete("/images/logo/upload", { preHandler: [verifyAuth] }, async (request, reply) => {
      const db = getDb();
      const row = db.prepare("SELECT value FROM app_settings WHERE key = 'brand_logo_path'").get();
      if (row?.value && fs.existsSync(row.value)) {
        try { fs.unlinkSync(row.value); } catch (_) { }
      }
      db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES ('brand_logo_path', '', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = '', updated_at = CURRENT_TIMESTAMP
    `).run();
      return { success: true };
    });



    // ─────────────────────────────────────────────────────────────────────────
    // SETTINGS — GET & SAVE
    // ─────────────────────────────────────────────────────────────────────────
    fastify.get("/images/settings", { preHandler: [verifyAuth] }, async (request, reply) => {
      const db = getDb();
      const rows = db.prepare("SELECT key, value FROM app_settings").all();
      const settings = {};
      for (const row of rows) {
        settings[row.key] = row.value;
      }
      return settings;
    });
    fastify.get("/settings/providers", { preHandler: [verifyAuth] }, async (request, reply) => {
      const db = getDb();

      // Hardcoded default models + providers
      const PROVIDERS = {
        openai: { label: 'OpenAI Direct', description: 'Official OpenAI GPT-Image models (Real-Time & Batch API)', icon: '⚡' },
        azure: { label: 'Azure OpenAI', description: 'GPT-Image models via Azure', icon: '☁️' },
        vertex: { label: 'Google Vertex AI', description: 'Gemini image models via Vertex AI', icon: '🔮' },
        xai: { label: 'xAI (Grok)', description: 'Grok Imagine models for image generation & style editing', icon: '⚡' },
      };

      const DEFAULT_MODELS = {
        'gpt-image-2': {
          provider: 'openai',
          label: 'GPT-Image-2',
          badge: 'OpenAI Flagship',
          badgeColor: '#10a37f',
          description: 'OpenAI Direct — 4K, reasoning-based high-fidelity photorealism, text rendering & inpainting edits',
          sizes: [
            { value: '1024x1024', label: '1024×1024 — Square (1:1)' },
            { value: '1536x1024', label: '1536×1024 — Landscape (3:2)' },
            { value: '1024x1536', label: '1024×1536 — Portrait (2:3)' },
            { value: '1088x1360', label: '1080×1350 — IG Portrait (4:5)' },
            { value: '1122x1402', label: '1122×1402 — Luxury Poster (4:5)' },
            { value: '1920x1088', label: '1920×1080 — Full HD (16:9)' },
            { value: '2048x2048', label: '2048×2048 — HD Square (1:1)' },
            { value: '2560x1440', label: '2560×1440 — 2K Landscape (16:9)' },
            { value: '1440x2560', label: '1440×2560 — 2K Portrait (9:16)' },
            { value: '3840x2160', label: '3840×2160 — 4K Landscape (16:9)' },
            { value: '2160x3840', label: '2160×3840 — 4K Portrait (9:16)' },
          ],
        },
        'gpt-image-2.5-flare': {
          provider: 'openai',
          label: 'GPT-Image 2.5 Flare',
          badge: 'Fast & Efficient',
          badgeColor: '#0ea5e9',
          description: 'OpenAI Direct — High-speed, cost-effective generation for rapid social and web assets',
          sizes: [
            { value: '1024x1024', label: '1024×1024 — Square (1:1)' },
            { value: '1536x1024', label: '1536×1024 — Landscape (3:2)' },
            { value: '1024x1536', label: '1024×1536 — Portrait (2:3)' },
            { value: '1920x1088', label: '1920×1080 — Full HD (16:9)' },
          ],
        },
        'gpt-image-2.5-sunburst': {
          provider: 'openai',
          label: 'GPT-Image 2.5 Sunburst',
          badge: 'Premium Creative',
          badgeColor: '#d97706',
          description: 'OpenAI Direct — Flagship premium creative model with state-of-the-art styling',
          sizes: [
            { value: '1024x1024', label: '1024×1024 — Square (1:1)' },
            { value: '1536x1024', label: '1536×1024 — Landscape (3:2)' },
            { value: '1024x1536', label: '1024×1536 — Portrait (2:3)' },
            { value: '1088x1360', label: '1080×1350 — IG Portrait (4:5)' },
            { value: '1920x1088', label: '1920×1080 — Full HD (16:9)' },
          ],
        },
        'azure-gpt-image-2': {
          provider: 'azure',
          label: 'GPT-Image-2 (Azure)',
          badge: 'Azure GA',
          badgeColor: '#22c55e',
          description: 'Azure OpenAI — 4K, realistic generation, broad aspect ratios & inpainting edit',
          sizes: [
            { value: '1024x1024', label: '1024×1024 — Square (1:1)' },
            { value: '1536x1024', label: '1536×1024 — Landscape (3:2)' },
            { value: '1600x900', label: '1600×900 — 16:9 HD' },
            { value: '1024x1536', label: '1024×1536 — Portrait (2:3)' },
            { value: '1920x1088', label: '1920×1080 — Full HD (16:9)' },
            { value: '1088x1360', label: '1080×1350 — IG Portrait (4:5)' },
            { value: '2048x2048', label: '2048×2048 — HD Square (1:1)' },
          ],
        },
        'azure-gpt-image-2.5-flare': {
          provider: 'azure',
          label: 'GPT-Image 2.5 Flare (Azure)',
          badge: 'Azure Flare',
          badgeColor: '#0ea5e9',
          description: 'Azure OpenAI — High-speed, cost-effective generation for rapid social and web assets',
          sizes: [
            { value: '1024x1024', label: '1024×1024 — Square (1:1)' },
            { value: '1536x1024', label: '1536×1024 — Landscape (3:2)' },
            { value: '1024x1536', label: '1024×1536 — Portrait (2:3)' },
            { value: '1088x1360', label: '1080×1350 — IG Portrait (4:5)' },
            { value: '1920x1088', label: '1920×1080 — Full HD (16:9)' },
          ],
        },
        'azure-gpt-image-2.5-sunburst': {
          provider: 'azure',
          label: 'GPT-Image 2.5 Sunburst (Azure)',
          badge: 'Azure Sunburst',
          badgeColor: '#d97706',
          description: 'Azure OpenAI — Flagship premium creative model with state-of-the-art styling',
          sizes: [
            { value: '1024x1024', label: '1024×1024 — Square (1:1)' },
            { value: '1536x1024', label: '1536×1024 — Landscape (3:2)' },
            { value: '1024x1536', label: '1024×1536 — Portrait (2:3)' },
            { value: '1088x1360', label: '1080×1350 — IG Portrait (4:5)' },
            { value: '1920x1088', label: '1920×1080 — Full HD (16:9)' },
          ],
        },
        'gemini-3.1-flash-image': {
          provider: 'vertex',
          label: 'Gemini 3.1 Flash Image',
          badge: 'Vertex AI Image',
          badgeColor: '#10b981',
          description: 'Google Vertex AI — High-speed native AI image generation & direct transformation',
          sizes: [
            { value: '1024x1024', label: '1024×1024 — Square (1:1)' },
            { value: '1536x1024', label: '1536×1024 — Landscape (3:2)' },
            { value: '1024x1536', label: '1024×1536 — Portrait (2:3)' },
            { value: '1920x1080', label: '1920×1080 — Full HD (16:9)' },
            { value: '1080x1920', label: '1080×1920 — Full HD (9:16)' },
            { value: '1080x1350', label: '1080×1350 — IG Portrait (4:5)' },
            { value: '2048x2048', label: '2048×2048 — HD Square (1:1)' },
          ],
        },
        'gemini-3-pro-image': {
          provider: 'vertex',
          label: 'Gemini 3 Pro Image',
          badge: 'Vertex AI Pro Image',
          badgeColor: '#8b5cf6',
          description: 'Google Vertex AI — Flagship high-fidelity AI image generation & inpainting',
          sizes: [
            { value: '1024x1024', label: '1024×1024 — Square (1:1)' },
            { value: '1536x1024', label: '1536×1024 — Landscape (3:2)' },
            { value: '1024x1536', label: '1024×1536 — Portrait (2:3)' },
            { value: '1920x1080', label: '1920×1080 — Full HD (16:9)' },
            { value: '1080x1920', label: '1080×1920 — Full HD (9:16)' },
            { value: '1080x1350', label: '1080×1350 — IG Portrait (4:5)' },
            { value: '2048x2048', label: '2048×2048 — 2K Square (1:1)' },
            { value: '2560x1440', label: '2560×1440 — 2K Landscape (16:9)' },
            { value: '3840x2160', label: '3840×2160 — 4K Landscape (16:9)' },
          ],
        },
        'grok-imagine-image-2.0': {
          provider: 'xai',
          label: 'Grok Imagine 2.0',
          badge: 'xAI Flagship',
          badgeColor: '#000000',
          description: 'xAI Imagine — High photorealism, style transfer & multi-turn inpainting edit ($0.04/img)',
          sizes: [
            { value: '1024x1024', label: '1024×1024 — Square (1:1)' },
            { value: '1536x1024', label: '1536×1024 — Landscape (3:2)' },
            { value: '1024x1536', label: '1024×1536 — Portrait (2:3)' },
            { value: '1920x1080', label: '1920×1080 — Full HD (16:9)' },
            { value: '1080x1920', label: '1080×1920 — Story / Reel (9:16)' },
            { value: '2048x2048', label: '2048×2048 — 2K Square (1:1)' },
          ],
        },
        'grok-imagine-image-quality': {
          provider: 'xai',
          label: 'Grok Imagine Quality',
          badge: 'High Quality',
          badgeColor: '#6366f1',
          description: 'xAI Imagine — Maximum fidelity and aesthetic quality generation ($0.05/img)',
          sizes: [
            { value: '1024x1024', label: '1024×1024 — Square (1:1)' },
            { value: '1536x1024', label: '1536×1024 — Landscape (3:2)' },
            { value: '1024x1536', label: '1024×1536 — Portrait (2:3)' },
            { value: '1920x1080', label: '1920×1080 — Full HD (16:9)' },
          ],
        },
        'grok-imagine-image': {
          provider: 'xai',
          label: 'Grok Imagine Fast',
          badge: 'Fast & Affordable',
          badgeColor: '#14b8a6',
          description: 'xAI Imagine — High-speed, affordable image generation ($0.02/img)',
          sizes: [
            { value: '1024x1024', label: '1024×1024 — Square (1:1)' },
            { value: '1536x1024', label: '1536×1024 — Landscape (3:2)' },
            { value: '1024x1536', label: '1024×1536 — Portrait (2:3)' },
            { value: '1920x1080', label: '1920×1080 — Full HD (16:9)' },
          ],
        }
      };

      let models = { ...DEFAULT_MODELS };
      try {
        const customModelsRow = db.prepare("SELECT value FROM app_settings WHERE key = 'custom_models'").get();
        if (customModelsRow && customModelsRow.value) {
          const customModels = JSON.parse(customModelsRow.value);
          if (Array.isArray(customModels)) {
            customModels.forEach(m => {
              if (m.id) {
                models[m.id] = {
                  provider: m.provider,
                  label: m.label,
                  badge: m.badge || 'Custom',
                  badgeColor: m.badgeColor || '#f59e0b',
                  description: m.description,
                  sizes: m.sizes || [{ value: '1024x1024', label: '1024×1024 — Square' }]
                };
              }
            });
          }
        }
      } catch (e) {
        console.error("Failed to parse custom models", e);
      }

      return { providers: PROVIDERS, models };
    });

    fastify.post("/images/settings", { preHandler: [verifyAuth] }, async (request, reply) => {
      const db = getDb();
      const settings = request.body || {};

      const upsert = db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);

      const updateMany = db.transaction((entries) => {
        for (const [key, value] of entries) {
          upsert.run(key, String(value));
        }
      });

      updateMany(Object.entries(settings));
      return { success: true, saved: Object.keys(settings).length };
    });

    fastify.post("/images/settings/test-provider", { preHandler: [verifyAuth] }, async (request, reply) => {
      const db = getDb();
      const { provider, credentials = {} } = request.body || {};

      if (!provider) {
        return reply.code(400).send({ success: false, error: "Provider is required." });
      }

      try {
        if (provider === "azure") {
          const endpoint = (credentials.azure_endpoint || getAppSetting(db, "azure_endpoint", "AZURE_OPENAI_ENDPOINT")).replace(/\/$/, "");
          const apiKey = credentials.azure_api_key || getAppSetting(db, "azure_api_key", "AZURE_OPENAI_API_KEY");
          const apiVersion = credentials.azure_api_version || getAppSetting(db, "azure_api_version", "AZURE_OPENAI_API_VERSION") || "2025-04-01-preview";
          const agentModel = credentials.azure_agent_model || getAppSetting(db, "azure_agent_model", "AZURE_OPENAI_AGENT_MODEL") || "gpt-5.4-mini";

          if (!endpoint || !apiKey) {
            return { success: false, error: "Azure Endpoint and API Key are required." };
          }

          let baseEndpoint = endpoint;
          if (baseEndpoint.endsWith("/openai/v1")) {
            baseEndpoint = baseEndpoint.slice(0, -"/openai/v1".length);
          }
          baseEndpoint = baseEndpoint.replace(/\/$/, "");

          // First try probing /openai/v1/models (supported by Azure OpenAI & Azure AI Services)
          try {
            const res = await axios.get(`${baseEndpoint}/openai/v1/models`, {
              headers: { "api-key": apiKey },
              timeout: 10000,
            });
            if (res.status >= 200 && res.status < 300) {
              return { success: true, message: "Connected successfully to Azure OpenAI / AI Foundry!" };
            }
          } catch (_) {}

          let chatUrl;
          let headers = { "Content-Type": "application/json", "api-key": apiKey };
          let isServerlessEndpoint = false;

          if (endpoint.endsWith("/openai/v1")) {
            chatUrl = `${endpoint}/chat/completions`;
            headers["Authorization"] = `Bearer ${apiKey}`;
            isServerlessEndpoint = true;
          } else {
            chatUrl = `${baseEndpoint}/openai/deployments/${agentModel}/chat/completions?api-version=${apiVersion}`;
          }

          const payload = {
            messages: [{ role: "user", content: "Test connection ping" }],
            max_completion_tokens: 5
          };
          if (isServerlessEndpoint) payload.model = agentModel;

          const res = await axios.post(chatUrl, payload, { headers, timeout: 15000 });
          if (res.status >= 200 && res.status < 300) {
            return { success: true, message: "Connected successfully to Azure OpenAI!" };
          } else {
            return { success: false, error: `Azure responded with status ${res.status}` };
          }
        } else if (provider === "vertex") {
          const projectId = credentials.vertex_project_id || getAppSetting(db, "vertex_project_id", "GOOGLE_VERTEX_PROJECT_ID");
          const location = credentials.vertex_location || getAppSetting(db, "vertex_location", "GOOGLE_VERTEX_LOCATION") || "global";
          const saKeyStr = credentials.vertex_sa_key || getAppSetting(db, "vertex_sa_key", "GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON");
          const credFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

          if (!projectId) {
            return { success: false, error: "Google Vertex AI Project ID is required." };
          }

          let keyData = null;
          if (saKeyStr && saKeyStr.trim()) {
            const trimmed = saKeyStr.trim();
            if (trimmed.startsWith("{")) {
              keyData = JSON.parse(trimmed);
            } else {
              const decoded = Buffer.from(trimmed, "base64").toString("utf8");
              keyData = JSON.parse(decoded);
            }
          } else if (credFile && fs.existsSync(credFile)) {
            keyData = JSON.parse(fs.readFileSync(credFile, "utf8"));
          }

          if (!keyData || !keyData.client_email || !keyData.private_key) {
            return { success: false, error: "Valid Service Account JSON (or GOOGLE_APPLICATION_CREDENTIALS file) is required for Vertex AI." };
          }

          const crypto = require("crypto");
          const header = { alg: "RS256", typ: "JWT" };
          const now = Math.floor(Date.now() / 1000);
          const claim = {
            iss: keyData.client_email,
            scope: "https://www.googleapis.com/auth/cloud-platform",
            aud: keyData.token_uri || "https://www.googleapis.com/oauth2/v4/token",
            exp: now + 3600,
            iat: now,
          };

          const base64UrlEncode = (str) => Buffer.from(str).toString("base64url");
          const encodedHeader = base64UrlEncode(JSON.stringify(header));
          const encodedClaim = base64UrlEncode(JSON.stringify(claim));
          const signatureInput = `${encodedHeader}.${encodedClaim}`;

          const signer = crypto.createSign("RSA-SHA256");
          signer.update(signatureInput);
          const signature = signer.sign(keyData.private_key, "base64url");
          const jwt = `${signatureInput}.${signature}`;

          const tokenRes = await axios.post(keyData.token_uri || "https://www.googleapis.com/oauth2/v4/token", {
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt,
          }, { timeout: 15000 });

          if (tokenRes.data && tokenRes.data.access_token) {
            return { success: true, message: `Connected successfully to Google Vertex AI (Project: ${projectId}, Location: ${location})!` };
          } else {
            return { success: false, error: "Failed to obtain access token from Google OAuth2 server." };
          }
        } else if (provider === "openai") {
          const apiKey = credentials.openai_api_key || getAppSetting(db, "openai_api_key", "OPENAI_API_KEY");
          const baseUrl = (credentials.openai_base_url || getAppSetting(db, "openai_base_url", "OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");

          if (!apiKey) {
            return { success: false, error: "OpenAI API Key is required." };
          }

          const res = await axios.get(`${baseUrl}/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 15000
          });

          if (res.status === 200) {
            const models = (res.data?.data || []).map(m => m.id);
            const hasGptImage = models.some(m => m.includes("gpt-image"));
            return {
              success: true,
              message: `Connected successfully to OpenAI! (Found ${models.length} models, GPT-Image support: ${hasGptImage ? "Active" : "Standard"})`
            };
          } else {
            return { success: false, error: `OpenAI responded with status ${res.status}` };
          }
        } else if (provider === "xai") {
          const apiKey = credentials.xai_api_key || getAppSetting(db, "xai_api_key", "XAI_API_KEY");
          const baseUrl = (credentials.xai_base_url || getAppSetting(db, "xai_base_url", "XAI_BASE_URL") || "https://api.x.ai/v1").replace(/\/$/, "");

          if (!apiKey) {
            return { success: false, error: "xAI API Key is required." };
          }

          const res = await axios.get(`${baseUrl}/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 15000
          });

          if (res.status === 200) {
            return { success: true, message: "Connected successfully to xAI (Grok)!" };
          } else {
            return { success: false, error: `xAI responded with status ${res.status}` };
          }
        } else if (provider === "bedrock") {
          const accessKey = credentials.aws_access_key_id || getAppSetting(db, "aws_access_key_id", "AWS_ACCESS_KEY_ID");
          const secretKey = credentials.aws_secret_access_key || getAppSetting(db, "aws_secret_access_key", "AWS_SECRET_ACCESS_KEY");
          const region = credentials.aws_region || getAppSetting(db, "aws_region", "AWS_REGION") || "us-east-1";

          if (!accessKey || !secretKey) {
            return { success: false, error: "AWS Access Key ID and Secret Access Key are required." };
          }

          return { success: true, message: `AWS Bedrock credentials configured for region ${region}!` };
        } else {
          return { success: false, error: `Unknown provider: ${provider}` };
        }
      } catch (err) {
        const errorMsg = err.response?.data?.error?.message || err.response?.data?.error || err.message || "Connection test failed.";
        return { success: false, error: errorMsg };
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // UPLOAD & QUEUE IMAGE EDIT / GENERATION
    // ─────────────────────────────────────────────────────────────────────────
    fastify.post("/images/edit", { preHandler: [verifyAuth] }, async (request, reply) => {
      const parts = request.parts();
      const batchId = crypto.randomUUID();
      let aiProvider = "azure";
      let isBatchPrompt = true;
      let batchPrompt = "";
      let model = process.env.AZURE_OPENAI_DEFAULT_MODEL || "gpt-image-2";
      let imageSize = "1920x1088";
      let outputFormat = "webp";
      let quality = "high";
      let imageCount = 1;
      let operationType = "edit";
      let processingMode = null;
      let applyLogo = true;
      let imaginaryCompressionLevel = null;
      let imaginaryResize = null;
      let imaginaryResizeBehavior = null;
      let useAgentBrain = false;
      let bypassPromptTemplate = false;
      const files = [];
      const individualPrompts = {};

      for await (const part of parts) {
        if (part.type === "file") {
          const jobId = crypto.randomUUID();
          const ext = path.extname(part.filename).toLowerCase();
          const safeName = `${jobId}${ext}`;
          const savePath = path.join(STORAGE_PATH, "images", safeName);

          await new Promise((resolve, reject) => {
            const stream = fs.createWriteStream(savePath);
            part.file.pipe(stream);
            part.file.on("end", resolve);
            part.file.on("error", reject);
          });

          files.push({ jobId, filename: part.filename, path: savePath });
        } else {
          if (part.fieldname === "aiProvider" || part.fieldname === "ai_provider") aiProvider = part.value;
          if (part.fieldname === "isBatchPrompt" || part.fieldname === "is_batch_prompt") isBatchPrompt = part.value === "true" || part.value === true;
          if (part.fieldname === "batchPrompt" || part.fieldname === "batch_prompt" || part.fieldname === "prompt") batchPrompt = part.value;
          if (part.fieldname === "model") model = part.value;
          if (part.fieldname === "imageSize" || part.fieldname === "image_size") imageSize = part.value;
          if (part.fieldname === "outputFormat" || part.fieldname === "output_format") outputFormat = part.value;
          if (part.fieldname === "quality") quality = part.value;
          if (part.fieldname === "imageCount" || part.fieldname === "image_count") imageCount = parseInt(part.value, 10) || 1;
          if (part.fieldname === "operationType" || part.fieldname === "operation_type") operationType = part.value;
          if (part.fieldname === "processingMode" || part.fieldname === "processing_mode") {
            const val = (part.value || "").toLowerCase().trim();
            if (val === "batch" || val === "realtime") processingMode = val;
          }
          if (part.fieldname === "applyLogo" || part.fieldname === "apply_logo") applyLogo = part.value === "true";
          if (part.fieldname === "imaginaryCompressionLevel" || part.fieldname === "imaginary_compression_level") imaginaryCompressionLevel = part.value;
          if (part.fieldname === "imaginaryResize" || part.fieldname === "imaginary_resize") imaginaryResize = part.value;
          if (part.fieldname === "imaginaryResizeBehavior" || part.fieldname === "imaginary_resize_behavior") imaginaryResizeBehavior = part.value;
          if (part.fieldname === "useAgentBrain" || part.fieldname === "use_agent_brain") useAgentBrain = part.value === "true";
          if (part.fieldname === "bypassPromptTemplate" || part.fieldname === "bypass_prompt_template") bypassPromptTemplate = part.value === "true";
          if (part.fieldname.startsWith("prompt_")) {
            const index = part.fieldname.split("_")[1];
            individualPrompts[index] = part.value;
          }
        }
      }

      // Default processingMode: OpenAI gpt-image-2 defaults to batch processing (50% Off)
      if (!processingMode) {
        if (aiProvider === "openai" && (model === "gpt-image-2" || !model)) {
          processingMode = "batch";
        } else {
          processingMode = "realtime";
        }
      } else if (aiProvider !== "openai" && processingMode === "batch") {
        processingMode = "realtime";
      }

      // ───────────────────────────────────────────────────────────────────────
      // INPUT VALIDATION
      // ───────────────────────────────────────────────────────────────────────
      const MAX_IMAGE_COUNT = 10;
      const MAX_PROMPT_LENGTH = 5000;
      const MAX_FILES_PER_BATCH = 50;

      // Validate imageCount
      if (imageCount < 1 || imageCount > MAX_IMAGE_COUNT) {
        return reply.code(400).send({
          error: `imageCount must be between 1 and ${MAX_IMAGE_COUNT}`,
          code: "INVALID_IMAGE_COUNT"
        });
      }

      // Validate batchPrompt length
      if (batchPrompt && batchPrompt.length > MAX_PROMPT_LENGTH) {
        return reply.code(400).send({
          error: `batchPrompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`,
          code: "PROMPT_TOO_LONG"
        });
      }

      // Validate individual prompts
      for (const [index, prompt] of Object.entries(individualPrompts)) {
        if (prompt && prompt.length > MAX_PROMPT_LENGTH) {
          return reply.code(400).send({
            error: `prompt_${index} exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`,
            code: "PROMPT_TOO_LONG"
          });
        }
      }

      // Validate files count
      if (files.length > MAX_FILES_PER_BATCH) {
        return reply.code(400).send({
          error: `Too many files. Maximum ${MAX_FILES_PER_BATCH} files per batch`,
          code: "TOO_MANY_FILES"
        });
      }

      if (operationType === "convert") {
        aiProvider = "none";
        model = null;
      }

      // Validate aiProvider
      const VALID_PROVIDERS = ["azure", "vertex", "openai", "xai", "bedrock", "none", "local"];
      if (!VALID_PROVIDERS.includes(aiProvider)) {
        return reply.code(400).send({
          error: `Invalid aiProvider. Must be one of: ${VALID_PROVIDERS.join(", ")}`,
          code: "INVALID_PROVIDER"
        });
      }

      // Validate operationType
      const VALID_OPERATIONS = ["edit", "generate", "convert"];
      if (!VALID_OPERATIONS.includes(operationType)) {
        return reply.code(400).send({
          error: `Invalid operationType. Must be one of: ${VALID_OPERATIONS.join(", ")}`,
          code: "INVALID_OPERATION"
        });
      }

      // Validate outputFormat
      const VALID_FORMATS = ["png", "jpg", "jpeg", "webp", "avif"];
      if (!VALID_FORMATS.includes(outputFormat.toLowerCase())) {
        return reply.code(400).send({
          error: `Invalid outputFormat. Must be one of: ${VALID_FORMATS.join(", ")}`,
          code: "INVALID_FORMAT"
        });
      }

      // Validate quality
      const VALID_QUALITIES = ["low", "medium", "high"];
      if (!VALID_QUALITIES.includes(quality.toLowerCase())) {
        return reply.code(400).send({
          error: `Invalid quality. Must be one of: ${VALID_QUALITIES.join(", ")}`,
          code: "INVALID_QUALITY"
        });
      }

      // Sanitize batchPrompt (remove potential script injection)
      if (batchPrompt) {
        batchPrompt = batchPrompt.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
      }

      // For pure generation (no input files), create a synthetic entry
      if (files.length === 0 && operationType === "generate" && batchPrompt) {
        const jobId = crypto.randomUUID();
        files.push({ jobId, filename: null, path: null });
      }

      if (files.length === 0) {
        return reply.code(400).send({ error: "No files uploaded" });
      }

      // Fetch settings to get the prompt template
      const db = getDb();
      const templateRow = db.prepare("SELECT value FROM app_settings WHERE key = 'default_prompt_template'").get();
      const promptTemplate = templateRow ? templateRow.value : "";

      const jobsToQueue = [];

      files.forEach((file, index) => {
        const individualPrompt = individualPrompts[index] || individualPrompts[String(index)];
        const rawPrompt = isBatchPrompt
          ? (batchPrompt || individualPrompt || "")
          : (individualPrompt || batchPrompt || "");
        const prompt = (promptTemplate && !bypassPromptTemplate) ? `${promptTemplate} ${rawPrompt}`.trim() : rawPrompt;

        const insert = db.prepare(`
        INSERT INTO image_jobs (id, batch_id, status, original_filename, original_path, ai_provider, prompt, model, image_size, output_format, quality, image_count, operation_type, processing_mode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
        insert.run(
          file.jobId, batchId, "waiting",
          file.filename || "generate", file.path || "",
          aiProvider, prompt, model, imageSize, outputFormat, quality, imageCount, operationType, processingMode
        );

        jobsToQueue.push({
          name: "edit-image",
          data: {
            jobId: file.jobId,
            batchId,
            originalPath: file.path,
            aiProvider,
            prompt,
            model,
            imageSize,
            outputFormat,
            quality,
            imageCount,
            operationType,
            processingMode,
            applyLogo,
            imaginaryCompressionLevel,
            imaginaryResize,
            imaginaryResizeBehavior,
            useAgentBrain
          },
        });
      });

      await imageQueue.addBulk(jobsToQueue);

      return {
        message: "Images queued for processing",
        batchId,
        jobIds: jobsToQueue.map(j => j.data.jobId),
        jobCount: jobsToQueue.length,
      };
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SINGLE JOB STATUS (for polling)
    // ─────────────────────────────────────────────────────────────────────────
    fastify.get("/images/job/:jobId", async (request, reply) => {
      const db = getDb();
      const job = db.prepare("SELECT * FROM image_jobs WHERE id = ?").get(request.params.jobId);
      if (!job) return reply.code(404).send({ error: "Job not found" });

      // Attach preview and download URLs if result exists
      if (job.result_path) {
        job.preview_url = `/api/images/preview/${path.basename(job.result_path)}`;
        job.download_url = `/api/images/download/${path.basename(job.result_path)}`;
        job.job_download_url = `/api/images/job/${job.id}/download`;
      }

      // Attach partial preview if available
      const partialName = `${job.id}_partial`;
      const imagesDir = path.join(STORAGE_PATH, "images");
      if (fs.existsSync(imagesDir)) {
        const partialFiles = fs.readdirSync(imagesDir)
          .filter(f => f.startsWith(partialName))
          .sort();
        if (partialFiles.length > 0) {
          job.partial_preview_url = `/api/images/preview/${partialFiles[partialFiles.length - 1]}`;
        }
      }

      return job;
    });

    // ─────────────────────────────────────────────────────────────────────────
    // BATCH STATUS (all jobs in a batch)
    // ─────────────────────────────────────────────────────────────────────────
    fastify.get("/images/batch/:batchId", async (request, reply) => {
      const db = getDb();
      const jobs = db.prepare("SELECT * FROM image_jobs WHERE batch_id = ? ORDER BY created_at ASC").all(request.params.batchId);

      const enriched = jobs.map(job => {
        if (job.result_path) {
          job.preview_url = `/api/images/preview/${path.basename(job.result_path)}`;
          job.download_url = `/api/images/download/${path.basename(job.result_path)}`;
          job.job_download_url = `/api/images/job/${job.id}/download`;
        }
        const partialName = `${job.id}_partial`;
        const imagesDir = path.join(STORAGE_PATH, "images");
        if (fs.existsSync(imagesDir)) {
          const partialFiles = fs.readdirSync(imagesDir)
            .filter(f => f.startsWith(partialName))
            .sort();
          if (partialFiles.length > 0) {
            job.partial_preview_url = `/api/images/preview/${partialFiles[partialFiles.length - 1]}`;
          }
        }
        return job;
      });

      return enriched;
    });

    // Helper for zip filenames
    const sanitizeFilename = (name) => {
      return (name || "image")
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_.-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '') || "image";
    };

    // ─────────────────────────────────────────────────────────────────────────
    // BATCH DOWNLOAD ZIP
    // ─────────────────────────────────────────────────────────────────────────
    fastify.get("/images/batch/:batchId/download", async (request, reply) => {
      const db = getDb();
      const jobs = db.prepare("SELECT * FROM image_jobs WHERE batch_id = ? AND status = 'completed'").all(request.params.batchId);

      const validJobs = jobs.filter(j => j.result_path && fs.existsSync(j.result_path));
      if (!validJobs || validJobs.length === 0) {
        return reply.code(404).send({ error: "No completed jobs found for this batch" });
      }

      const archive = typeof archiver === 'function' ? archiver("zip", { zlib: { level: 9 } }) : new archiver.ZipArchive({ zlib: { level: 9 } });
      const batchZipName = `batch-${sanitizeFilename(request.params.batchId)}.zip`;
      reply.header("Content-Type", "application/zip");
      reply.header("Content-Disposition", `attachment; filename="${batchZipName}"`);

      archive.on("error", (err) => { throw err; });

      reply.send(archive);

      validJobs.forEach((job, index) => {
        const origExt = path.extname(job.original_filename) || "";
        const resExt = path.extname(job.result_path);
        let name = job.original_filename || `image-${job.id}`;
        if (origExt) {
          name = name.slice(0, -origExt.length);
        }

        name = sanitizeFilename(name);

        const finalName = `${index + 1}-${name}${resExt}`;
        archive.file(job.result_path, { name: finalName });
      });

      archive.finalize();
      return reply;
    });

    // ─────────────────────────────────────────────────────────────────────────
    // DOWNLOAD SELECTED JOBS AS ZIP
    // ─────────────────────────────────────────────────────────────────────────
    const handleDownloadSelectedZip = async (request, reply) => {
      const db = getDb();
      let ids = [];
      if (request.body && Array.isArray(request.body.ids)) {
        ids = request.body.ids;
      } else if (request.query && request.query.ids) {
        ids = String(request.query.ids).split(",").map(s => s.trim()).filter(Boolean);
      }

      if (!ids || ids.length === 0) {
        return reply.code(400).send({ error: "ids array or comma-separated list required" });
      }

      const placeholders = ids.map(() => "?").join(",");
      const jobs = db.prepare(`SELECT * FROM image_jobs WHERE id IN (${placeholders}) AND status = 'completed'`).all(...ids);

      const validJobs = jobs.filter(j => j.result_path && fs.existsSync(j.result_path));
      if (validJobs.length === 0) {
        return reply.code(404).send({ error: "No completed jobs with available files found for selected IDs" });
      }

      const archive = typeof archiver === 'function' ? archiver("zip", { zlib: { level: 9 } }) : new archiver.ZipArchive({ zlib: { level: 9 } });
      const zipName = `selected-images-${Date.now()}.zip`;

      reply.header("Content-Type", "application/zip");
      reply.header("Content-Disposition", `attachment; filename="${zipName}"`);

      archive.on("error", (err) => { throw err; });
      reply.send(archive);

      validJobs.forEach((job, index) => {
        const origExt = path.extname(job.original_filename) || "";
        const resExt = path.extname(job.result_path);
        let name = job.original_filename || `image-${job.id}`;
        if (origExt) {
          name = name.slice(0, -origExt.length);
        }
        name = sanitizeFilename(name);
        const finalName = `${index + 1}-${name}${resExt}`;
        archive.file(job.result_path, { name: finalName });
      });

      archive.finalize();
      return reply;
    };

    fastify.post("/images/jobs/download-zip", handleDownloadSelectedZip);
    fastify.get("/images/jobs/download-zip", handleDownloadSelectedZip);

    // ─────────────────────────────────────────────────────────────────────────
    // HISTORY
    // ─────────────────────────────────────────────────────────────────────────
    fastify.get("/images/history", { preHandler: [verifyAuth] }, async (request, reply) => {
      const db = getDb();
      const limit = parseInt(request.query.limit || "100", 10);
      const rows = db.prepare("SELECT * FROM image_jobs ORDER BY created_at DESC LIMIT ?").all(limit);

      return rows.map(job => {
        if (job.result_path) {
          if (job.operation_type === 'slideshow') {
            job.preview_url = `/api/jobs/${job.id}/download`;
            job.download_url = `/api/jobs/${job.id}/download?download=true`;
            job.job_download_url = `/api/jobs/${job.id}/download?download=true`;
          } else {
            job.preview_url = `/api/images/preview/${path.basename(job.result_path)}`;
            job.download_url = `/api/images/download/${path.basename(job.result_path)}`;
            job.job_download_url = `/api/images/job/${job.id}/download`;
          }
        }
        return job;
      });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PREVIEW IMAGE (inline display, no download header)
    // ─────────────────────────────────────────────────────────────────────────
    fastify.get("/images/preview/:filename", async (request, reply) => {
      const filename = request.params.filename;
      const safePath = path.join(STORAGE_PATH, "images", path.basename(filename));

      if (!fs.existsSync(safePath)) {
        return reply.code(404).send({ error: "File not found" });
      }

      const ext = path.extname(filename).toLowerCase();
      const contentType = ext === ".mp4" ? "video/mp4" :
        ext === ".webp" ? "image/webp" :
        ext === ".png" ? "image/png" :
        ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
        ext === ".avif" ? "image/avif" :
        "application/octet-stream";

      reply.header("Content-Type", contentType);
      reply.header("Cache-Control", "public, max-age=31536000, immutable");
      return reply.send(fs.createReadStream(safePath));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // DOWNLOAD IMAGE BY FILENAME (permanent, never expires)
    // ─────────────────────────────────────────────────────────────────────────
    fastify.get("/images/download/:filename", async (request, reply) => {
      const filename = request.params.filename;
      const safePath = path.join(STORAGE_PATH, "images", path.basename(filename));

      if (!fs.existsSync(safePath)) {
        return reply.code(404).send({ error: "File not found" });
      }

      const stream = fs.createReadStream(safePath);
      const ext = path.extname(filename).toLowerCase();
      const contentType = ext === ".mp4" ? "video/mp4" :
        ext === ".webp" ? "image/webp" :
        ext === ".png" ? "image/png" :
        ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
        ext === ".avif" ? "image/avif" :
        "application/octet-stream";

      reply.header("Content-Type", contentType);
      reply.header("Content-Disposition", `attachment; filename="edited_${filename}"`);
      reply.header("Cache-Control", "public, max-age=31536000, immutable");
      return reply.send(stream);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // DOWNLOAD IMAGE BY JOB ID (permanent, never expires)
    // ─────────────────────────────────────────────────────────────────────────
    fastify.get("/images/job/:jobId/download", async (request, reply) => {
      const db = getDb();
      const job = db.prepare("SELECT * FROM image_jobs WHERE id = ?").get(request.params.jobId);
      if (!job) {
        return reply.code(404).send({ error: "Job not found" });
      }
      if (job.status !== "completed" || !job.result_path || !fs.existsSync(job.result_path)) {
        return reply.code(404).send({ error: "Job is not completed or result file not found" });
      }

      const safePath = job.result_path;
      const filename = path.basename(safePath);
      const stream = fs.createReadStream(safePath);
      const ext = path.extname(filename).toLowerCase();
      const contentType = ext === ".mp4" ? "video/mp4" :
        ext === ".webp" ? "image/webp" :
        ext === ".png" ? "image/png" :
        ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
        ext === ".avif" ? "image/avif" :
        "application/octet-stream";

      const downloadName = job.original_filename && job.original_filename !== "generate"
        ? (job.original_filename.endsWith(ext) ? job.original_filename : `${job.original_filename}${ext}`)
        : filename;

      reply.header("Content-Type", contentType);
      reply.header("Content-Disposition", `attachment; filename="${downloadName}"`);
      reply.header("Cache-Control", "public, max-age=31536000, immutable");
      return reply.send(stream);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // DELETE HISTORY JOBS — by list of IDs
    // ─────────────────────────────────────────────────────────────────────────
    fastify.delete("/images/jobs", { preHandler: [verifyAuth] }, async (request, reply) => {
      const db = getDb();
      const { ids } = request.body || {};
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return reply.code(400).send({ error: "ids array required" });
      }

      let deleted = 0;
      for (const id of ids) {
        const job = db.prepare("SELECT result_path, original_path FROM image_jobs WHERE id = ?").get(id);
        if (job) {
          // Remove result file
          if (job.result_path && fs.existsSync(job.result_path)) {
            try { fs.unlinkSync(job.result_path); } catch (e) { /* ignore */ }
          }
          // Remove original uploaded file
          if (job.original_path && fs.existsSync(job.original_path)) {
            try { fs.unlinkSync(job.original_path); } catch (e) { /* ignore */ }
          }
          db.prepare("DELETE FROM image_jobs WHERE id = ?").run(id);
          deleted++;
        }
      }
      return { success: true, deleted };
    });

    // ─────────────────────────────────────────────────────────────────────────
    // DELETE HISTORY JOBS — by operation type
    // ─────────────────────────────────────────────────────────────────────────
    fastify.delete("/images/jobs/type/:type", { preHandler: [verifyAuth] }, async (request, reply) => {
      const db = getDb();
      const { type } = request.params;
      const validTypes = ["edit", "generate", "convert", "slideshow", "metadata", "failed"];
      if (!validTypes.includes(type)) {
        return reply.code(400).send({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` });
      }

      let jobs;
      if (type === "failed") {
        jobs = db.prepare("SELECT id, result_path, original_path FROM image_jobs WHERE status = 'failed'").all();
      } else {
        jobs = db.prepare("SELECT id, result_path, original_path FROM image_jobs WHERE operation_type = ?").all(type);
      }

      for (const job of jobs) {
        if (job.result_path && fs.existsSync(job.result_path)) {
          try { fs.unlinkSync(job.result_path); } catch (e) { /* ignore */ }
        }
        if (job.original_path && fs.existsSync(job.original_path)) {
          try { fs.unlinkSync(job.original_path); } catch (e) { /* ignore */ }
        }
      }

      if (type === "failed") {
        db.prepare("DELETE FROM image_jobs WHERE status = 'failed'").run();
      } else {
        db.prepare("DELETE FROM image_jobs WHERE operation_type = ?").run(type);
      }

      return { success: true, deleted: jobs.length };
    });

    // ─────────────────────────────────────────────────────────────────────────
    // VISION PROMPT ENHANCEMENT
    // ─────────────────────────────────────────────────────────────────────────
    async function callVisionPromptEnhancer(messages) {
      const db = getDb();
      const vertexProjectId = getAppSetting(db, "vertex_project_id", "GOOGLE_VERTEX_PROJECT_ID");
      const vertexLocation = getAppSetting(db, "vertex_location", "GOOGLE_VERTEX_LOCATION") || "global";
      const saKeyPaths = ["/app/vertex-sa-key.json", path.join(__dirname, "..", "..", "vertex-sa-key.json"), path.join(__dirname, "..", "vertex-sa-key.json")];
      const validSaPath = saKeyPaths.find(p => fs.existsSync(p));

      if (vertexProjectId && validSaPath) {
        try {
          const key = JSON.parse(fs.readFileSync(validSaPath, "utf8"));
          const header = { alg: "RS256", typ: "JWT" };
          const now = Math.floor(Date.now() / 1000);
          const claim = {
            iss: key.client_email,
            scope: "https://www.googleapis.com/auth/cloud-platform",
            aud: "https://www.googleapis.com/oauth2/v4/token",
            exp: now + 3600,
            iat: now
          };
          const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
          const toSign = b64(header) + "." + b64(claim);
          const sign = crypto.createSign("RSA-SHA256");
          sign.update(toSign); sign.end();
          const jwt = toSign + "." + sign.sign(key.private_key, "base64url");

          const tokenRes = await axios.post("https://www.googleapis.com/oauth2/v4/token", 
            `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${encodeURIComponent(jwt)}`,
            { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 }
          );
          const token = tokenRes.data?.access_token;

          if (token) {
            const parts = [];
            for (const msg of messages) {
              if (typeof msg.content === "string") {
                parts.push({ text: msg.content });
              } else if (Array.isArray(msg.content)) {
                for (const item of msg.content) {
                  if (item.type === "text") {
                    parts.push({ text: item.text });
                  } else if (item.type === "image_url" && item.image_url?.url) {
                    const dataUrl = item.image_url.url;
                    if (dataUrl.startsWith("data:")) {
                      const commaIdx = dataUrl.indexOf(",");
                      const mimeMatch = dataUrl.match(/data:([^;]+);/);
                      const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
                      const base64Data = dataUrl.substring(commaIdx + 1);
                      parts.push({
                        inlineData: { mimeType, data: base64Data }
                      });
                    }
                  }
                }
              }
            }

            const host = vertexLocation === "global" ? "aiplatform.googleapis.com" : `${vertexLocation}-aiplatform.googleapis.com`;
            const url = `https://${host}/v1beta1/projects/${vertexProjectId}/locations/${vertexLocation}/publishers/google/models/gemini-2.5-flash:generateContent`;

            const geminiRes = await axios.post(url, {
              contents: [{ role: "user", parts }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
            }, {
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              timeout: 60000
            });

            const text = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text && text.trim()) return text.trim();
          }
        } catch (e) {
          console.warn("[Vertex Vision Enhancer Error]:", e.response?.data || e.message);
        }
      }

      const azureEndpoint = getAppSetting(db, "azure_endpoint", "AZURE_OPENAI_ENDPOINT");
      const azureApiKey = getAppSetting(db, "azure_api_key", "AZURE_OPENAI_API_KEY");
      const azureApiVersion = getAppSetting(db, "azure_api_version", "AZURE_OPENAI_API_VERSION") || "2025-04-01-preview";
      const agentModel = getAppSetting(db, "azure_agent_model", "AZURE_OPENAI_AGENT_MODEL") || "gpt-5.4-mini";

      if (azureEndpoint && azureApiKey) {
        let chatUrl;
        let headers = { "Content-Type": "application/json" };
        let isServerlessEndpoint = false;

        if (azureEndpoint.endsWith("/openai/v1")) {
          chatUrl = `${azureEndpoint}/chat/completions`;
          headers["Authorization"] = `Bearer ${azureApiKey}`;
          isServerlessEndpoint = true;
        } else {
          let baseEndpoint = azureEndpoint.replace(/\/$/, "");
          chatUrl = `${baseEndpoint}/openai/deployments/${agentModel}/chat/completions?api-version=${azureApiVersion}`;
          headers["api-key"] = azureApiKey;
        }

        const payload = {
          messages,
          temperature: 0.7,
          max_completion_tokens: 1000
        };
        if (isServerlessEndpoint) {
          payload.model = agentModel;
        }

        const response = await axios.post(chatUrl, payload, { headers, timeout: 60000 });
        const content = response.data?.choices?.[0]?.message?.content;
        if (content) return content.trim();
      }

      const openaiKey = getAppSetting(db, "openai_api_key", "OPENAI_API_KEY");
      const openaiBase = getAppSetting(db, "openai_base_url", "OPENAI_BASE_URL") || "https://api.openai.com/v1";
      const openaiModel = getAppSetting(db, "openai_vision_model", "OPENAI_VISION_MODEL") || "gpt-4o-mini";
      if (openaiKey) {
        const chatUrl = `${openaiBase}/chat/completions`;
        const headers = {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`
        };
        const response = await axios.post(chatUrl, {
          model: openaiModel,
          messages,
          temperature: 0.7,
          max_completion_tokens: 1000
        }, { headers, timeout: 60000 });
        const content = response.data?.choices?.[0]?.message?.content;
        if (content) return content.trim();
      }

      throw new Error("No Vision AI credentials configured (Google Vertex AI, Azure OpenAI or OpenAI credentials required). Please check Settings.");
    }

    fastify.post("/images/enhance-prompt", { preHandler: [verifyAuth] }, async (request, reply) => {
      try {
        const parts = request.parts();
        let isBatchPrompt = true;
        let batchPrompt = "";
        const individualPrompts = {};
        const files = [];

        for await (const part of parts) {
          if (part.type === "file") {
            const chunks = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            const mimeType = part.mimetype || "image/jpeg";
            const filename = part.filename;
            files.push({ buffer, mimeType, filename, fieldname: part.fieldname });
          } else {
            if (part.fieldname === "isBatchPrompt") isBatchPrompt = part.value === "true";
            if (part.fieldname === "batchPrompt" || part.fieldname === "prompt") batchPrompt = part.value;
            if (part.fieldname.startsWith("prompt_")) {
              const index = part.fieldname.split("_")[1];
              individualPrompts[index] = part.value;
            }
          }
        }

        const SYSTEM_PROMPT = `You are an expert AI visual prompt engineer. Your job is to analyze the user's input image (if provided) and their target prompt, and generate an enhanced, highly detailed visual prompt for image generation/editing.
Focus on visual aesthetics: photographic details, lighting, depth, composition, textures, colors, mood, and artistic styling.
Keep the original user intent intact while adding vivid details.
IMPORTANT: Return ONLY the final enhanced prompt text. Do NOT include markdown code blocks, conversational intro, quotes, or explanations.`;

        if (isBatchPrompt) {
          const userContent = [
            { type: "text", text: `User Target Prompt: "${batchPrompt || "Enhance and describe a high quality visual scene based on the image."}"` }
          ];

          for (const file of files) {
            const b64 = file.buffer.toString("base64");
            userContent.push({
              type: "image_url",
              image_url: { url: `data:${file.mimeType};base64,${b64}` }
            });
          }

          const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent }
          ];

          const enhancedPrompt = await callVisionPromptEnhancer(messages);
          return { success: true, enhancedPrompt };
        } else {
          const enhancedPrompts = {};

          if (files.length > 0) {
            for (let i = 0; i < files.length; i++) {
              const file = files[i];
              const idxKey = file.fieldname.startsWith("file_") ? file.fieldname.split("_")[1] : String(i);
              const promptText = individualPrompts[idxKey] || batchPrompt || "Enhance and describe a high quality visual scene based on this image.";
              const b64 = file.buffer.toString("base64");

              const messages = [
                { role: "system", content: SYSTEM_PROMPT },
                {
                  role: "user",
                  content: [
                    { type: "text", text: `User Target Prompt: "${promptText}"` },
                    { type: "image_url", image_url: { url: `data:${file.mimeType};base64,${b64}` } }
                  ]
                }
              ];

              const enhanced = await callVisionPromptEnhancer(messages);
              enhancedPrompts[idxKey] = enhanced;
            }
          } else {
            const indices = Object.keys(individualPrompts);
            if (indices.length === 0) indices.push("0");
            for (const idxKey of indices) {
              const promptText = individualPrompts[idxKey] || batchPrompt || "Enhance and describe a high quality visual scene.";
              const messages = [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `User Target Prompt: "${promptText}"` }
              ];
              const enhanced = await callVisionPromptEnhancer(messages);
              enhancedPrompts[idxKey] = enhanced;
            }
          }

          return { success: true, enhancedPrompts };
        }
      } catch (err) {
        request.log.error(err, "Vision prompt enhancement failed");
        return reply.code(500).send({ error: err.message || "Vision prompt enhancement failed" });
      }
    });
  };