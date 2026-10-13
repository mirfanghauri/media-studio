"use strict";

const path = require("path");
const axios = require("axios");
const sharp = require("sharp");
const FormData = require("form-data");

const IMAGINARY_URL = process.env.IMAGINARY_URL || "http://imaginary:9000";

/**
 * Validate and normalise image size for a given model.
 *   GPT-Image-1.5   → only 1024x1024, 1024x1536, 1536x1024
 *   GPT-Image-2     → arbitrary (multiples of 16, max 3840px)
 *   Vertex Imagen   → standard sizes via aspect ratio matching
 */
function validateSize(model, requestedSize) {
  const GPT15_VALID = ["1024x1024", "1024x1536", "1536x1024"];
  if (model === "gpt-image-1.5") {
    return GPT15_VALID.includes(requestedSize) ? requestedSize : "1024x1024";
  }

  const VERTEX_VALID = [
    "1024x1024", "1536x1024", "1024x1536", "2048x2048", "1600x900", "900x1600",
    "1080x1350", "1920x1080", "1080x1920", "2560x1440", "1440x2560", "3840x2160", "2160x3840"
  ];
  if (model && (model.startsWith("gemini-") || model.startsWith("imagen-"))) {
    return VERTEX_VALID.includes(requestedSize) ? requestedSize : "1024x1024";
  }

  if (requestedSize && requestedSize.includes("x")) {
    let [w, h] = requestedSize.toLowerCase().split("x").map(Number);
    if (!isNaN(w) && !isNaN(h)) {
      // Exact 4:5 ratio for IG Portrait (1080 / 1350 — snap to multiples of 16)
      if (w === 1080 && h === 1350) return "1088x1360";
      w = Math.round(w / 16) * 16;
      h = Math.round(h / 16) * 16;
      w = Math.max(256, Math.min(w, 3840));
      h = Math.max(256, Math.min(h, 3840));
      return `${w}x${h}`;
    }
  }

  return requestedSize || "1024x1024";
}

/**
 * Derive Imagen / Gemini aspect ratio string from pixel dimensions.
 */
function deriveAspectRatio(w, h) {
  if (!w || !h || isNaN(w) || isNaN(h)) return "1:1";
  const ratio = w / h;
  if (Math.abs(ratio - 1.0) < 0.08) return "1:1";
  if (Math.abs(ratio - 16 / 9) < 0.08) return "16:9";
  if (Math.abs(ratio - 9 / 16) < 0.08) return "9:16";
  if (Math.abs(ratio - 4 / 5) < 0.08) return "4:5";
  if (Math.abs(ratio - 5 / 4) < 0.08) return "5:4";
  if (Math.abs(ratio - 4 / 3) < 0.08) return "4:3";
  if (Math.abs(ratio - 3 / 4) < 0.08) return "3:4";
  if (Math.abs(ratio - 3 / 2) < 0.08) return "3:2";
  if (Math.abs(ratio - 2 / 3) < 0.08) return "2:3";
  return w > h ? "16:9" : (h > w ? "9:16" : "1:1");
}

/**
 * Convert a buffer via the Imaginary sidecar to the desired output format/compression.
 */
async function convertWithImaginary(inputBuffer, outputFormat, compression = 75, resize = null, resizeBehavior = "fit") {
  const fmt = outputFormat.toLowerCase();
  const typeMap = { png: "png", jpg: "jpeg", jpeg: "jpeg", webp: "webp", avif: "avif" };
  const imaginaryType = typeMap[fmt] || "webp";

  const params = new URLSearchParams({ type: imaginaryType });
  if (["jpeg", "webp", "avif"].includes(imaginaryType)) {
    params.set("quality", Math.max(1, Math.min(100, compression)).toString());
  }

  let endpoint = "/convert";
  if (resize && resize.toLowerCase() !== "original") {
    const [w, h] = resize.toLowerCase().split("x");
    if (w && h) {
      params.set("width", w);
      params.set("height", h);
      params.set("force", "true");

      if (resizeBehavior === "crop") {
        endpoint = "/resize";
      } else if (resizeBehavior === "stretch") {
        endpoint = "/resize";
        params.set("nocrop", "1");
      } else {
        endpoint = "/fit";
      }
    }
  }

  const form = new FormData();
  form.append("file", inputBuffer, { filename: "image.png", contentType: "image/png" });

  const res = await axios.post(`${IMAGINARY_URL}${endpoint}?${params.toString()}`, form, {
    headers: form.getHeaders(),
    responseType: "arraybuffer",
    timeout: 60000,
  });

  return Buffer.from(res.data);
}

/**
 * Convert image buffer with Imaginary, falling back to native Sharp.
 */
async function convertImageFormat(inputBuffer, outputFormat, compressionLevel = 85, resize = null, resizeBehavior = "fit", job = null) {
  const fmt = (outputFormat || "webp").toLowerCase();

  try {
    return await convertWithImaginary(inputBuffer, fmt, compressionLevel, resize, resizeBehavior);
  } catch (convErr) {
    if (job) job.log(`Imaginary conversion failed (${convErr.message}), falling back to Sharp → ${fmt}`);
    console.warn(`[CONVERSION_FALLBACK] Imaginary failed: ${convErr.message}. Using Sharp to ${fmt}`);
  }

  try {
    let pipeline = sharp(inputBuffer);

    if (resize && resize.toLowerCase() !== "original") {
      const parts = resize.toLowerCase().split("x");
      const w = parseInt(parts[0], 10);
      const h = parseInt(parts[1], 10);
      if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
        if (resizeBehavior === "crop") {
          pipeline = pipeline.resize(w, h, { fit: "cover" });
        } else if (resizeBehavior === "stretch") {
          pipeline = pipeline.resize(w, h, { fit: "fill" });
        } else {
          pipeline = pipeline.resize(w, h, { fit: "inside", withoutEnlargement: false });
        }
      }
    }

    const quality = Math.max(1, Math.min(100, compressionLevel));
    if (fmt === "webp") {
      pipeline = pipeline.webp({ quality });
    } else if (fmt === "jpg" || fmt === "jpeg") {
      pipeline = pipeline.jpeg({ quality });
    } else if (fmt === "avif") {
      pipeline = pipeline.avif({ quality });
    } else {
      pipeline = pipeline.png({ compressionLevel: 9 });
    }

    return await pipeline.toBuffer();
  } catch (sharpErr) {
    if (job) job.log(`Sharp conversion fallback failed: ${sharpErr.message}`);
    console.error(`[CONVERSION_ERROR] Sharp fallback failed:`, sharpErr);
    return inputBuffer;
  }
}

module.exports = { validateSize, deriveAspectRatio, convertWithImaginary, convertImageFormat };
