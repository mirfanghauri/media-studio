"use strict";

const getDb = require("../db");
const { verifyAuth } = require("../middleware/auth");

// Sensitive keys that must NEVER be returned in plaintext
const SENSITIVE_KEY_PATTERNS = [
  /key/i,
  /secret/i,
  /password/i,
  /token/i,
  /sa_file/i,
];

function maskValue(val) {
  if (!val || typeof val !== "string") return val;
  if (val.length <= 8) return "********";
  return val.slice(0, 4) + "..." + val.slice(-4);
}

async function settingsRoutes(app) {
  app.get("/settings", { preHandler: [verifyAuth] }, async (req, reply) => {
    try {
      const db = getDb();
      const rows = db.prepare(`SELECT key, value FROM app_settings`).all();
      const settings = {};
      for (const row of rows) {
        const isSensitive = SENSITIVE_KEY_PATTERNS.some(pat => pat.test(row.key));
        settings[row.key] = isSensitive ? maskValue(row.value) : row.value;
      }
      return settings;
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch settings" });
    }
  });

  app.post("/settings", {
    preHandler: [verifyAuth],
    schema: {
      body: {
        type: "object",
        additionalProperties: { type: "string" }
      }
    }
  }, async (req, reply) => {
    try {
      const db = getDb();
      const stmt = db.prepare(`
        INSERT INTO app_settings (key, value, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP) 
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
      `);
      
      db.transaction(() => {
        for (const [key, value] of Object.entries(req.body)) {
          // If value is masked, do not overwrite the existing secret
          if (typeof value === "string" && value.includes("...")) {
            continue;
          }
          stmt.run(key, value);
        }
      })();
      
      return { success: true, message: "Settings updated successfully" };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: "Failed to update settings" });
    }
  });
}

module.exports = settingsRoutes;
