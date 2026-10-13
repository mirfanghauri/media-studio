"use strict";

const fs = require("fs");
const path = require("path");
const getDb = require("../../db");
const { verifyAuth } = require("../../middleware/auth");

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, "..", "..", "..", "storage");

module.exports = async function (fastify, opts) {
  // ── Single job status ─────────────────────────────────────────────────────
  fastify.get("/images/job/:jobId", { preHandler: [verifyAuth] }, async (request, reply) => {
    const db = getDb();
    const { jobId } = request.params;
    const job = db.prepare("SELECT * FROM image_jobs WHERE id = ?").get(jobId);

    if (!job) return reply.code(404).send({ error: "Job not found" });

    let metadata = null;
    if (job.metadata) {
      try { metadata = JSON.parse(job.metadata); } catch (_) {}
    }

    let fileSize = metadata?.optimized_size || metadata?.original_size || null;
    if (metadata?.result_width && metadata?.result_height) {
      job.image_size = `${metadata.result_width}x${metadata.result_height}`;
      job.actual_size = job.image_size;
    }
    if (!fileSize && job.result_path && fs.existsSync(job.result_path)) {
      try { fileSize = fs.statSync(job.result_path).size; } catch (_) {}
    }
    job.file_size = fileSize;

    const resultFilename = job.result_path ? path.basename(job.result_path) : null;
    if (resultFilename) {
      if (job.operation_type === 'slideshow') {
        job.preview_url = `/api/images/job/${job.id}/download`;
        job.download_url = `/api/images/job/${job.id}/download`;
        job.job_download_url = `/api/images/job/${job.id}/download`;
      } else {
        job.preview_url = `/api/images/preview/${resultFilename}`;
        job.download_url = `/api/images/download/${resultFilename}`;
        job.job_download_url = `/api/images/job/${job.id}/download`;
      }
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

    if (job.created_at && !job.created_at.includes('T')) {
      job.created_at = job.created_at.replace(' ', 'T') + 'Z';
    }
    if (job.updated_at && !job.updated_at.includes('T')) {
      job.updated_at = job.updated_at.replace(' ', 'T') + 'Z';
    }

    return {
      ...job,
      metadata,
      resultUrl: job.download_url || null,
      previewUrl: job.preview_url || null,
    };
  });

  // ── Batch status ──────────────────────────────────────────────────────────
  fastify.get("/images/batch/:batchId", async (request, reply) => {
    const db = getDb();
    const { batchId } = request.params;
    const jobs = db.prepare("SELECT * FROM image_jobs WHERE batch_id = ? ORDER BY created_at ASC").all(batchId);

    if (!jobs.length) return reply.code(404).send({ error: "Batch not found" });

    const enriched = jobs.map(job => {
      let metadata = null;
      if (job.metadata) {
        try { metadata = JSON.parse(job.metadata); } catch (_) {}
      }
      job.metadata = metadata;

      let bFileSize = metadata?.optimized_size || metadata?.original_size || null;
      if (metadata?.result_width && metadata?.result_height) {
        job.image_size = `${metadata.result_width}x${metadata.result_height}`;
        job.actual_size = job.image_size;
      }
      if (!bFileSize && job.result_path && fs.existsSync(job.result_path)) {
        try { bFileSize = fs.statSync(job.result_path).size; } catch (_) {}
      }
      job.file_size = bFileSize;

      if (job.result_path) {
        const resultFilename = path.basename(job.result_path);
        if (job.operation_type === 'slideshow') {
          job.preview_url = `/api/images/job/${job.id}/download`;
          job.download_url = `/api/images/job/${job.id}/download`;
          job.job_download_url = `/api/images/job/${job.id}/download`;
        } else {
          job.preview_url = `/api/images/preview/${resultFilename}`;
          job.download_url = `/api/images/download/${resultFilename}`;
          job.job_download_url = `/api/images/job/${job.id}/download`;
        }
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

      if (job.created_at && !job.created_at.includes('T')) {
        job.created_at = job.created_at.replace(' ', 'T') + 'Z';
      }
      if (job.updated_at && !job.updated_at.includes('T')) {
        job.updated_at = job.updated_at.replace(' ', 'T') + 'Z';
      }

      job.resultUrl = job.download_url || null;
      job.previewUrl = job.preview_url || null;
      return job;
    });

    return enriched;
  });
};
