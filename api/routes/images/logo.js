"use strict";

const path = require("path");
const fs = require("fs");
const getDb = require("../../db");
const { verifyAuth } = require("../../middleware/auth");

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, "..", "..", "..", "storage");

module.exports = async function (fastify, opts) {
  // ── Upload brand logo ───────────────────────────────────────────────────────
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

    const db = getDb();
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES ('brand_logo_path', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(savedPath);

    return { success: true, path: savedPath, url: `/api/images/logo/serve` };
  });

  // ── Serve current brand logo ────────────────────────────────────────────────
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

  // ── Delete brand logo ───────────────────────────────────────────────────────
  fastify.delete("/images/logo/upload", { preHandler: [verifyAuth] }, async (request, reply) => {
    const db = getDb();
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'brand_logo_path'").get();
    if (row?.value && fs.existsSync(row.value)) {
      try { fs.unlinkSync(row.value); } catch (_) {}
    }
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES ('brand_logo_path', '', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = '', updated_at = CURRENT_TIMESTAMP
    `).run();
    return { success: true };
  });
};
