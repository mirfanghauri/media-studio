"use strict";

const jwt = require("jsonwebtoken");

const secret = process.env.JWT_SECRET ? process.env.JWT_SECRET.trim() : "";
if (!secret || secret === "supersecretkey" || secret.includes("replace_with_a_secure_random_secret_key")) {
  throw new Error(
    "FATAL SECURITY CONFIGURATION: JWT_SECRET environment variable is missing, default, or insecure. " +
    "A strong random secret (minimum 32 characters) must be configured in .env."
  );
}

const JWT_SECRET = secret;

/**
 * Fastify preHandler — validates Bearer JWT token.
 */
async function verifyAuth(req, reply) {
  try {
    const authHeader = req.headers.authorization;
    let token = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }
    if (!token) {
      return reply.code(401).send({ error: "Missing or invalid authorization header" });
    }
    jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}

/**
 * Read a setting from the DB with optional env-var fallback.
 * @param {object} db    better-sqlite3 instance
 * @param {string} key   settings key
 * @param {string} envFallbackKey  optional env var name
 */
function getAppSetting(db, key, defaultValue = "") {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
    if (row && row.value && row.value.trim() !== "") {
      return row.value.trim();
    }
  } catch (_) {}
  return defaultValue;
}

module.exports = { verifyAuth, getAppSetting, JWT_SECRET };
