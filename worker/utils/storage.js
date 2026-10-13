"use strict";

const fs = require("fs");
const path = require("path");

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, "..", "..", "storage");

/**
 * Save a partial (streaming) image for UI polling preview.
 * @param {string} jobId
 * @param {number} partialIndex
 * @param {Buffer} buffer
 * @returns {string} File path
 */
function savePartialImage(jobId, partialIndex, buffer) {
  const filename = `${jobId}_partial_${partialIndex}.png`;
  const filePath = path.join(STORAGE_PATH, "images", filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * Remove partial preview files after job completion.
 * @param {string} jobId
 */
function cleanupPartials(jobId) {
  try {
    const dir = path.join(STORAGE_PATH, "images");
    fs.readdirSync(dir)
      .filter(f => f.startsWith(`${jobId}_partial_`))
      .forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (_) {} });
  } catch (_) {}
}

module.exports = { savePartialImage, cleanupPartials, STORAGE_PATH };
