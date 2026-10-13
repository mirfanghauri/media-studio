"use strict";

const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const jwt = require("jsonwebtoken");
const getDb = require("../../db");
const { verifyAuth, JWT_SECRET } = require("../../middleware/auth");

const EFFECTIVE_JWT_SECRET = JWT_SECRET || process.env.JWT_SECRET || "supersecretkey";

function createArchive(format = "zip", options = { zlib: { level: 6 } }) {
  if (typeof archiver === "function") return archiver(format, options);
  if (format === "zip" && archiver.ZipArchive) return new archiver.ZipArchive(options);
  if (format === "tar" && archiver.TarArchive) return new archiver.TarArchive(options);
  if (archiver.default && typeof archiver.default === "function") return archiver.default(format, options);
  throw new Error("Unable to initialize archiver");
}

async function verifyDownloadAuth(req, reply) {
  try {
    const authHeader = req.headers.authorization;
    let token = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }
    if (token) {
      jwt.verify(token, EFFECTIVE_JWT_SECRET);
      return;
    }
    // Allow direct browser download for valid UUID batch IDs (same security model as /images/download/:filename)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (req.params && req.params.batchId && uuidRegex.test(req.params.batchId)) {
      return;
    }
    return reply.code(401).send({ error: "Missing or invalid authorization header" });
  } catch (err) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, "..", "..", "..", "storage");

function resolveFilePath(filename) {
  if (!filename) return null;
  const safe = path.basename(filename);

  // 1. Direct in storage/images
  const imagesDir = path.join(STORAGE_PATH, "images");
  const full = path.join(imagesDir, safe);
  if (full.startsWith(imagesDir) && fs.existsSync(full)) return full;

  // 2. Query database for job matching this filename
  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT result_path, original_path 
      FROM image_jobs 
      WHERE result_path LIKE ? OR original_path LIKE ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `).get(`%/${safe}`, `%/${safe}`);

    if (row) {
      if (row.result_path && fs.existsSync(row.result_path)) return row.result_path;
      if (row.original_path && fs.existsSync(row.original_path)) return row.original_path;
    }
  } catch (_) {}

  // 3. Search storage/metadata subdirectories
  const metaDir = path.join(STORAGE_PATH, "metadata");
  if (fs.existsSync(metaDir)) {
    try {
      const subdirs = fs.readdirSync(metaDir);
      for (const sub of subdirs) {
        const candidate = path.join(metaDir, sub, safe);
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch (_) {}
  }

  // 4. Search storage/images subdirectories (e.g. images/<jobId>/<safe>)
  if (fs.existsSync(imagesDir)) {
    try {
      const subdirs = fs.readdirSync(imagesDir);
      for (const sub of subdirs) {
        const subPath = path.join(imagesDir, sub);
        if (fs.statSync(subPath).isDirectory()) {
          const candidate = path.join(subPath, safe);
          if (fs.existsSync(candidate)) return candidate;
        }
      }
    } catch (_) {}
  }

  return null;
}

module.exports = async function (fastify, opts) {
  // ── Preview (no Content-Disposition) ─────────────────────────────────────
  fastify.get("/images/preview/:filename", async (request, reply) => {
    const filePath = resolveFilePath(request.params.filename);
    if (!filePath) return reply.code(404).send({ error: "File not found" });
    const ext = path.extname(filePath).toLowerCase();
    const typeMap = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".mp4": "video/mp4", ".zip": "application/zip" };
    const ct = typeMap[ext] || "application/octet-stream";
    reply.header("Content-Type", ct);
    reply.header("Cache-Control", "public, max-age=3600");
    return reply.send(fs.createReadStream(filePath));
  });

  // ── Download single file ──────────────────────────────────────────────────
  fastify.get("/images/download/:filename", async (request, reply) => {
    const filePath = resolveFilePath(request.params.filename);
    if (!filePath) return reply.code(404).send({ error: "File not found" });
    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const typeMap = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".mp4": "video/mp4", ".zip": "application/zip" };
    const ct = typeMap[ext] || "application/octet-stream";
    reply.header("Content-Type", ct);
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return reply.send(fs.createReadStream(filePath));
  });

  // ── Download single job result ────────────────────────────────────────────
  fastify.get("/images/job/:jobId/download", async (request, reply) => {
    const db = getDb();
    const job = db.prepare("SELECT result_path, operation_type FROM image_jobs WHERE id = ?").get(request.params.jobId);
    let filePath = job?.result_path;

    if (!filePath || !fs.existsSync(filePath)) {
      // Fallback for slideshow or video jobs in videos directory, and metadata jobs
      const candidates = [
        path.join(STORAGE_PATH, "videos", request.params.jobId, "slideshow.mp4"),
        path.join(STORAGE_PATH, "videos", `${request.params.jobId}_slideshow.mp4`),
        path.join(STORAGE_PATH, "videos", `${request.params.jobId}.mp4`),
        path.join(STORAGE_PATH, "metadata", request.params.jobId, "metadata_images.zip"),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          filePath = c;
          break;
        }
      }
      if (!filePath || !fs.existsSync(filePath)) {
        const metaJobDir = path.join(STORAGE_PATH, "metadata", request.params.jobId);
        if (fs.existsSync(metaJobDir)) {
          try {
            const files = fs.readdirSync(metaJobDir);
            if (files.length > 0) {
              filePath = path.join(metaJobDir, files[0]);
            }
          } catch (_) {}
        }
      }
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return reply.code(404).send({ error: "Result not found" });
    }

    const stat = fs.statSync(filePath);
    const filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();
    const typeMap = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".mp4": "video/mp4", ".zip": "application/zip" };
    reply.header("Content-Type", typeMap[ext] || "application/octet-stream");

    const isDownload = request.query.download === "true" || request.query.download === "1";
    if (isDownload) {
      reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    } else {
      reply.header("Content-Disposition", `inline; filename="${filename}"`);
    }

    if (ext === ".mp4") {
      reply.header("Accept-Ranges", "bytes");
      const range = request.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunksize = (end - start) + 1;
        reply.code(206);
        reply.header("Content-Range", `bytes ${start}-${end}/${stat.size}`);
        reply.header("Content-Length", chunksize);
        return reply.send(fs.createReadStream(filePath, { start, end }));
      }
    }

    reply.header("Content-Length", stat.size);
    return reply.send(fs.createReadStream(filePath));
  });

  // ── Download batch as ZIP ─────────────────────────────────────────────────
  fastify.get("/images/batch/:batchId/download", { preHandler: [verifyDownloadAuth] }, async (request, reply) => {
    const db = getDb();
    const jobs = db.prepare("SELECT id, result_path, original_filename FROM image_jobs WHERE batch_id = ? AND status = 'completed'").all(request.params.batchId);

    if (!jobs.length) return reply.code(404).send({ error: "No completed jobs in this batch" });

    reply.header("Content-Type", "application/zip");
    reply.header("Content-Disposition", `attachment; filename="batch_${request.params.batchId}.zip"`);

    const archive = createArchive("zip", { zlib: { level: 6 } });
    for (const job of jobs) {
      if (job.result_path && fs.existsSync(job.result_path)) {
        archive.file(job.result_path, { name: path.basename(job.result_path) });
      }
    }

    archive.finalize();
    return reply.send(archive);
  });

  // ── Download selected jobs as ZIP (POST or GET with ids / jobIds) ─────────
  const handleDownloadSelectedZip = async (request, reply) => {
    let ids = [];
    if (request.body && Array.isArray(request.body.ids)) {
      ids = request.body.ids;
    } else if (request.body && Array.isArray(request.body.jobIds)) {
      ids = request.body.jobIds;
    } else if (request.query && request.query.ids) {
      ids = String(request.query.ids).split(",").map(s => s.trim()).filter(Boolean);
    } else if (request.query && request.query.jobIds) {
      ids = String(request.query.jobIds).split(",").map(s => s.trim()).filter(Boolean);
    }

    if (!ids || !ids.length) {
      return reply.code(400).send({ error: "jobIds or ids array is required" });
    }

    const db = getDb();
    const placeholders = ids.map(() => "?").join(",");
    const jobs = db.prepare(`SELECT id, result_path, original_filename FROM image_jobs WHERE id IN (${placeholders}) AND status = 'completed'`).all(...ids);

    if (!jobs.length) return reply.code(404).send({ error: "No completed jobs found" });

    reply.header("Content-Type", "application/zip");
    reply.header("Content-Disposition", `attachment; filename="selected_${Date.now()}.zip"`);

    const archive = createArchive("zip", { zlib: { level: 6 } });
    for (const job of jobs) {
      const filePath = (job.result_path && fs.existsSync(job.result_path)) ? job.result_path : resolveFilePath(job.result_path || `image-${job.id}`);
      if (filePath && fs.existsSync(filePath)) {
        const ext = path.extname(filePath);
        let name = job.original_filename || path.basename(filePath);
        const origExt = path.extname(name);
        if (origExt) name = name.slice(0, -origExt.length);
        name = name.replace(/[^a-zA-Z0-9_\-\.\s]/g, "_").trim();
        const finalName = `${job.id.slice(0, 8)}_${name}${ext}`;
        archive.file(filePath, { name: finalName });
      }
    }

    archive.finalize();
    return reply.send(archive);
  };

  fastify.post("/images/jobs/download-zip", { preHandler: [verifyAuth] }, handleDownloadSelectedZip);
  fastify.get("/images/jobs/download-zip", { preHandler: [verifyAuth] }, handleDownloadSelectedZip);
};
