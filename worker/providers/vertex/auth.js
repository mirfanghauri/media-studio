"use strict";

const crypto = require("crypto");
const fs = require("fs");
const axios = require("axios");
const { getSetting } = require("../../utils/settings");

/**
 * Create a signed JWT for Google service account authentication (RS256).
 * @param {object} keyData  Parsed service account JSON
 * @returns {string} Signed JWT string
 */
function createSignedJWT(keyData) {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: keyData.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: keyData.token_uri || "https://www.googleapis.com/oauth2/v4/token",
    exp: now + 3600,
    iat: now,
  };
  const base64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const toSign = `${base64url(header)}.${base64url(claim)}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(toSign);
  sign.end();
  const signature = sign.sign(keyData.private_key).toString("base64url");
  return `${toSign}.${signature}`;
}

/**
 * Get an OAuth2 access token for Vertex AI.
 * Priority:
 *   1. vertex_sa_key setting / GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON env (inline JSON or base64)
 *   2. GOOGLE_APPLICATION_CREDENTIALS file path
 *   3. google-auth-library default credentials
 */
async function getVertexAccessToken() {
  const saKeyStr = getSetting("vertex_sa_key");
  const credFile = getSetting("vertex_sa_file") || (fs.existsSync("/app/vertex-sa-key.json") ? "/app/vertex-sa-key.json" : null);

  if (saKeyStr && saKeyStr.trim()) {
    let keyData = null;
    const trimmed = saKeyStr.trim();
    if (trimmed.startsWith("{")) {
      keyData = JSON.parse(trimmed);
    } else {
      const decoded = Buffer.from(trimmed, "base64").toString("utf8");
      keyData = JSON.parse(decoded);
    }
    const jwt = createSignedJWT(keyData);
    const tokenRes = await axios.post(
      keyData.token_uri || "https://www.googleapis.com/oauth2/v4/token",
      {
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      },
      { timeout: 30000 }
    );
    return tokenRes.data.access_token;
  }

  if (credFile && fs.existsSync(credFile)) {
    const keyData = JSON.parse(fs.readFileSync(credFile, "utf8"));
    const jwt = createSignedJWT(keyData);
    const tokenRes = await axios.post(
      keyData.token_uri || "https://www.googleapis.com/oauth2/v4/token",
      {
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      },
      { timeout: 30000 }
    );
    return tokenRes.data.access_token;
  }

  try {
    const { GoogleAuth } = require("google-auth-library");
    const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    return token.token;
  } catch (_) {
    throw new Error(
      "Vertex AI authentication failed. Set Service Account JSON in Settings or GOOGLE_APPLICATION_CREDENTIALS in environment."
    );
  }
}

module.exports = { createSignedJWT, getVertexAccessToken };
