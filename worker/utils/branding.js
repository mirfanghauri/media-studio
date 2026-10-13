"use strict";

const sharp = require("sharp");

/**
 * Overlay the brand logo onto an image buffer using Sharp.
 * Logo is composited at the specified position with opacity and size constraints.
 *
 * @param {Buffer} imageBuffer     Main image buffer (PNG)
 * @param {string} logoPath        Absolute path to brand logo file
 * @param {object} opts            Logo options
 * @param {string} opts.position   top-left|top-right|bottom-left|bottom-right|center
 * @param {number} opts.sizePercent  Logo width as % of image width (1-50)
 * @param {number} opts.opacity    0-100 opacity
 */
async function applyBrandLogo(imageBuffer, logoPath, opts = {}) {
  const { position = "bottom-right", sizePercent = 15, opacity = 85 } = opts;

  const mainMeta = await sharp(imageBuffer).metadata();
  const imgWidth = mainMeta.width || 1024;
  const imgHeight = mainMeta.height || 1024;

  const logoWidth = Math.round(imgWidth * (sizePercent / 100));

  let logoBuffer = await sharp(logoPath)
    .resize({ width: logoWidth, withoutEnlargement: false })
    .ensureAlpha()
    .modulate({ alpha: opacity / 100 })
    .png()
    .toBuffer();

  const logoMeta = await sharp(logoBuffer).metadata();
  const logoH = logoMeta.height || logoWidth;
  const logoW = logoMeta.width || logoWidth;

  const PADDING = Math.round(imgWidth * 0.02);

  let left, top;
  switch (position) {
    case "top-left":
      left = PADDING; top = PADDING; break;
    case "top-right":
      left = imgWidth - logoW - PADDING; top = PADDING; break;
    case "bottom-left":
      left = PADDING; top = imgHeight - logoH - PADDING; break;
    case "center":
      left = Math.round((imgWidth - logoW) / 2);
      top = Math.round((imgHeight - logoH) / 2);
      break;
    case "bottom-right":
    default:
      left = imgWidth - logoW - PADDING;
      top = imgHeight - logoH - PADDING;
      break;
  }

  left = Math.max(0, Math.min(left, imgWidth - logoW));
  top = Math.max(0, Math.min(top, imgHeight - logoH));

  return await sharp(imageBuffer)
    .composite([{ input: logoBuffer, left, top, blend: "over" }])
    .png()
    .toBuffer();
}

module.exports = { applyBrandLogo };
