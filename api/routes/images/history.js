"use strict";

const fs = require("fs");
const path = require("path");
const { Queue } = require("bullmq");
const getDb = require("../../db");
const { verifyAuth } = require("../../middleware/auth");

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, "..", "..", "..", "storage");

const imageQueue = new Queue("image-processing", {
  connection: {
    host: process.env.REDIS_HOST || "redis",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
  },
});

async function retryImageJob(jobId, db, queue) {
  const job = db.prepare("SELECT * FROM image_jobs WHERE id = ?").get(jobId);
  if (!job) {
    return { status: 404, error: "Job not found" };
  }

  if (job.status !== "failed") {
    return { status: 400, error: `Only failed jobs can be retried (current status: ${job.status})` };
  }

  const opType = job.operation_type || "edit";
  if (opType !== "generate" && job.original_path && !fs.existsSync(job.original_path)) {
    return { status: 400, error: "Original source file no longer exists on disk" };
  }

  const jobData = {
    jobId: job.id,
    batchId: job.batch_id || job.id,
    originalPath: job.original_path || null,
    aiProvider: job.ai_provider || "openai",
    prompt: job.prompt || "",
    model: job.model || "gpt-image-2",
    imageSize: job.image_size || "1024x1024",
    outputFormat: job.output_format || "webp",
    quality: job.quality || "high",
    imageCount: job.image_count || 1,
    operationType: opType,
    processingMode: job.processing_mode || null,
    applyLogo: true,
    imaginaryCompressionLevel: null,
    imaginaryResize: null,
    imaginaryResizeBehavior: null,
    useAgentBrain: false,
  };

  db.prepare(`
    UPDATE image_jobs
    SET status = 'waiting', error = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(job.id);

  try {
    await queue.add("edit-image", jobData);
  } catch (err) {
    db.prepare(`
      UPDATE image_jobs
      SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(`Failed to enqueue retry: ${err.message}`, job.id);
    return { status: 500, error: `Failed to enqueue retry: ${err.message}` };
  }

  return { success: true, jobId: job.id };
}

module.exports = async function (fastify, opts) {
  // ── GET history ───────────────────────────────────────────────────────────
  fastify.get("/images/history", { preHandler: [verifyAuth] }, async (request, reply) => {
    const db = getDb();
    const limit = Math.min(parseInt(request.query.limit || "500", 10), 10000);
    const rows = db.prepare("SELECT * FROM image_jobs ORDER BY created_at DESC LIMIT ?").all(limit);

    return rows.map(job => {
      let fileSize = null;
      let actualSize = job.image_size || null;
      if (job.metadata) {
        try {
          const meta = typeof job.metadata === "string" ? JSON.parse(job.metadata) : job.metadata;
          fileSize = meta?.optimized_size || meta?.original_size || null;
          if (meta?.result_width && meta?.result_height) {
            actualSize = `${meta.result_width}x${meta.result_height}`;
          }
        } catch (_) {}
      }

      let previewUrl = null;
      let downloadUrl = null;
      let jobDownloadUrl = null;

      if (job.result_path) {
        if (job.operation_type === 'slideshow') {
          previewUrl = `/api/jobs/${job.id}/download`;
          downloadUrl = `/api/jobs/${job.id}/download?download=true`;
          jobDownloadUrl = `/api/jobs/${job.id}/download?download=true`;
        } else if (job.operation_type === 'metadata') {
          const isZip = (job.result_path || '').toLowerCase().endsWith('.zip');
          previewUrl = isZip ? null : `/api/images/job/${job.id}/download`;
          downloadUrl = `/api/images/job/${job.id}/download?download=true`;
          jobDownloadUrl = `/api/images/job/${job.id}/download?download=true`;
        } else {
          const base = path.basename(job.result_path);
          previewUrl = `/api/images/preview/${base}`;
          downloadUrl = `/api/images/download/${base}`;
          jobDownloadUrl = `/api/images/job/${job.id}/download`;
        }
      }

      let createdAt = job.created_at;
      if (createdAt && !createdAt.includes('T')) {
        createdAt = createdAt.replace(' ', 'T') + 'Z';
      }
      let updatedAt = job.updated_at;
      if (updatedAt && !updatedAt.includes('T')) {
        updatedAt = updatedAt.replace(' ', 'T') + 'Z';
      }

      return {
        id: job.id,
        status: job.status,
        operation_type: job.operation_type,
        prompt: job.prompt,
        model: job.model,
        ai_provider: job.ai_provider,
        processing_mode: job.processing_mode,
        image_size: actualSize || job.image_size,
        actual_size: actualSize || job.image_size,
        file_size: fileSize,
        output_format: job.output_format,
        quality: job.quality,
        cost: job.cost,
        tokens_used: job.tokens_used,
        original_filename: job.original_filename,
        error: job.error,
        preview_url: previewUrl,
        download_url: downloadUrl,
        job_download_url: jobDownloadUrl,
        created_at: createdAt,
        updated_at: updatedAt,
      };
    });
  });

  // ── GET history stats (total spend & tokens) ─────────────────────────────
  fastify.get("/images/history/stats", { preHandler: [verifyAuth] }, async (request, reply) => {
    const db = getDb();
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_jobs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_jobs,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_jobs,
        ROUND(COALESCE(SUM(cost), 0.0), 4) as total_cost,
        COALESCE(SUM(tokens_used), 0) as total_tokens
      FROM image_jobs
    `).get();
    return stats;
  });

  // ── DELETE jobs by IDs or status ──────────────────────────────────────────
  fastify.delete("/images/jobs", { preHandler: [verifyAuth] }, async (request, reply) => {
    const db = getDb();
    const { ids, status } = request.body || {};

    if (ids && Array.isArray(ids) && ids.length > 0) {
      let deleted = 0;
      for (const id of ids) {
        const job = db.prepare("SELECT result_path, original_path FROM image_jobs WHERE id = ?").get(id);
        if (job) {
          if (job.result_path && fs.existsSync(job.result_path)) {
            try { fs.unlinkSync(job.result_path); } catch (e) { /* ignore */ }
          }
          if (job.original_path && fs.existsSync(job.original_path)) {
            try { fs.unlinkSync(job.original_path); } catch (e) { /* ignore */ }
          }
          db.prepare("DELETE FROM image_jobs WHERE id = ?").run(id);
          deleted++;
        }
      }
      return { success: true, deleted };
    }

    if (status && status !== "all") {
      const jobs = db.prepare("SELECT id, result_path, original_path FROM image_jobs WHERE status = ?").all(status);
      for (const job of jobs) {
        if (job.result_path && fs.existsSync(job.result_path)) {
          try { fs.unlinkSync(job.result_path); } catch (e) { /* ignore */ }
        }
        if (job.original_path && fs.existsSync(job.original_path)) {
          try { fs.unlinkSync(job.original_path); } catch (e) { /* ignore */ }
        }
      }
      db.prepare("DELETE FROM image_jobs WHERE status = ?").run(status);
      return { success: true, deleted: jobs.length };
    }

    return reply.code(400).send({ error: "ids array or status required" });
  });

  // ── DELETE jobs by operation type (or 'failed') ───────────────────────────
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
      db.prepare("DELETE FROM image_jobs WHERE status = 'failed'").run();
    } else {
      jobs = db.prepare("SELECT id, result_path, original_path FROM image_jobs WHERE operation_type = ?").all(type);
      db.prepare("DELETE FROM image_jobs WHERE operation_type = ?").run(type);
    }

    for (const job of jobs) {
      if (job.result_path && fs.existsSync(job.result_path)) {
        try { fs.unlinkSync(job.result_path); } catch (e) { /* ignore */ }
      }
      if (job.original_path && fs.existsSync(job.original_path)) {
        try { fs.unlinkSync(job.original_path); } catch (e) { /* ignore */ }
      }
    }

    return { success: true, deleted: jobs.length, type };
  });

  // ── RETRY single failed job ───────────────────────────────────────────────
  fastify.post("/images/jobs/:jobId/retry", { preHandler: [verifyAuth] }, async (request, reply) => {
    const db = getDb();
    const { jobId } = request.params;
    const result = await retryImageJob(jobId, db, imageQueue);
    if (!result.success) {
      return reply.code(result.status || 400).send({ error: result.error });
    }
    return { success: true, message: "Job retried successfully", jobId: result.jobId };
  });

  // ── RETRY bulk failed jobs ────────────────────────────────────────────────
  fastify.post("/images/jobs/retry", { preHandler: [verifyAuth] }, async (request, reply) => {
    const db = getDb();
    const { ids } = request.body || {};
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: "ids array required" });
    }
    const results = [];
    for (const id of ids) {
      const res = await retryImageJob(id, db, imageQueue);
      results.push({ id, ...res });
    }
    const retried = results.filter(r => r.success).length;
    return { success: true, retried, total: ids.length, details: results };
  });
};
