"use strict";

const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const { exiftool } = require("exiftool-vendored");
const { verifyAuth } = require("../middleware/auth");
const { validateSafeRemoteUrl, safeFetch } = require("../../shared/ssrf");

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, "..", "..", "storage");

async function metadataRoutes(app) {
  app.post("/images/metadata/inject", {
    preHandler: [verifyAuth],
    schema: {
      tags: ["images"],
      summary: "Inject EXIF/IPTC metadata into an image",
      description: "Upload an image and metadata JSON. Returns a URL to the metadata-injected image.",
      consumes: ["multipart/form-data"],
      response: {
        200: {
          type: "object",
          properties: {
            url: { type: "string" },
            message: { type: "string" }
          },
        },
        400: { type: "object", properties: { error: { type: "string" } } },
      },
    },
    validatorCompiler: () => () => true, // disable validation for multipart
  }, async (req, reply) => {
    const jobId = randomUUID();
    const workDir = path.join(STORAGE_PATH, "metadata", jobId);
    fs.mkdirSync(workDir, { recursive: true });

    let imagePaths = [];
    let metadata = {};

    try {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === "file" && part.fieldname === "image") {
          let safeName = part.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
          const buf = await part.toBuffer();

          // Auto-correct extension based on magic bytes (Exiftool is strict about this)
          if (buf.length > 12) {
            if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && 
                buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
              if (!safeName.toLowerCase().endsWith('.webp')) safeName = safeName.replace(/\.[^/.]+$/, "") + ".webp";
            } else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
              if (!safeName.toLowerCase().endsWith('.png')) safeName = safeName.replace(/\.[^/.]+$/, "") + ".png";
            } else if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
              if (!safeName.toLowerCase().match(/\.(jpg|jpeg)$/)) safeName = safeName.replace(/\.[^/.]+$/, "") + ".jpg";
            }
          }

          const imagePath = path.join(workDir, safeName);
          fs.writeFileSync(imagePath, buf);
          imagePaths.push(imagePath);
        } else if (part.fieldname === "metadata") {
          try {
            metadata = JSON.parse(part.value);
          } catch (e) {
            return reply.code(400).send({ error: "Invalid metadata JSON" });
          }
        }
      }

      if (imagePaths.length === 0) {
        return reply.code(400).send({ error: "No image uploaded" });
      }

      // Map our simple JSON to Exiftool tags
      const tags = {};
      if (metadata.Title) {
        tags.Title = metadata.Title;
        tags.ObjectName = metadata.Title;
      }
      if (metadata.Author) {
        tags.Artist = metadata.Author;
        tags['By-line'] = metadata.Author;
        tags.Creator = metadata.Author;
      }
      if (metadata.Copyright) {
        tags.Copyright = metadata.Copyright;
        tags.CopyrightNotice = metadata.Copyright;
      }
      if (metadata.Description) {
        tags.ImageDescription = metadata.Description;
        tags['Caption-Abstract'] = metadata.Description;
      }
      if (metadata.Keywords) {
        const kw = metadata.Keywords.split(',').map(k => k.trim()).filter(k => k);
        tags.Keywords = kw;
        tags.Subject = kw;
      }
      
      // New fields for Google Search Console Image Metadata compliance
      if (metadata.License) {
        tags.WebStatement = metadata.License;
      }
      if (metadata.AcquireLicensePage) {
        tags.LicensorURL = metadata.AcquireLicensePage;
      }
      if (metadata.CreditText) {
        tags.Credit = metadata.CreditText;
      }
      if (metadata.DatePublished) {
        tags.DateCreated = metadata.DatePublished;
        tags.CreateDate = metadata.DatePublished;
      }
      if (metadata.LocationName) {
        tags.Location = metadata.LocationName;
        tags['Sub-location'] = metadata.LocationName;
      }
      if (metadata.Latitude !== undefined && metadata.Latitude !== '') {
        const lat = parseFloat(metadata.Latitude);
        if (!isNaN(lat)) {
          tags.GPSLatitude = Math.abs(lat);
          tags.GPSLatitudeRef = lat >= 0 ? 'N' : 'S';
        }
      }
      if (metadata.Longitude !== undefined && metadata.Longitude !== '') {
        const lon = parseFloat(metadata.Longitude);
        if (!isNaN(lon)) {
          tags.GPSLongitude = Math.abs(lon);
          tags.GPSLongitudeRef = lon >= 0 ? 'E' : 'W';
        }
      }

      if (Object.keys(tags).length > 0) {
        for (const img of imagePaths) {
          await exiftool.write(img, tags, ["-overwrite_original"]);
        }
      }

      // Record job in history
      try {
        const getDb = require("../db");
        const db = getDb();
        const mainFilename = imagePaths.length === 1 ? path.basename(imagePaths[0]) : `${imagePaths.length}_images_metadata.zip`;
        const promptDesc = metadata.Title || metadata.Description || (metadata.Keywords ? `Keywords: ${metadata.Keywords}` : "EXIF/IPTC Metadata Injected");
        db.prepare(`
          INSERT INTO image_jobs (id, batch_id, status, original_filename, original_path, ai_provider, prompt, model, image_size, output_format, quality, image_count, operation_type, result_path)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          jobId,
          null,
          "completed",
          mainFilename,
          imagePaths[0],
          "exiftool",
          promptDesc,
          "EXIF Injector",
          "Original",
          imagePaths.length === 1 ? path.extname(imagePaths[0]).replace(".", "").toUpperCase() : "ZIP",
          "lossless",
          imagePaths.length,
          "metadata",
          imagePaths.length === 1 ? imagePaths[0] : path.join(workDir, "metadata_images.zip")
        );
      } catch (dbErr) {
        req.log.warn(`Failed to log metadata job to history: ${dbErr.message}`);
      }

      // If single file, return single file
      if (imagePaths.length === 1) {
        const publicUrl = `/api/images/metadata/download/${jobId}/${path.basename(imagePaths[0])}`;
        return {
          message: "Metadata injected successfully",
          url: publicUrl,
          isZip: false
        };
      }

      // If multiple, zip them
      const archiver = require('archiver');
      const zipPath = path.join(workDir, "metadata_images.zip");
      const output = fs.createWriteStream(zipPath);
      const archive = typeof archiver === 'function' ? archiver('zip', { zlib: { level: 9 } }) : new archiver.ZipArchive({ zlib: { level: 9 } });

      await new Promise((resolve, reject) => {
        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);
        for (const img of imagePaths) {
          archive.file(img, { name: path.basename(img) });
        }
        archive.finalize();
      });

      const publicUrl = `/api/images/metadata/download/zip/${jobId}`;
      return {
        message: "Metadata injected successfully for multiple images",
        url: publicUrl,
        isZip: true
      };

    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: "Failed to process metadata" });
    }
  });

  // ─── Inspect EXIF & Metadata ────────────────────────────────────────────────
  app.post("/images/metadata/inspect", {
    preHandler: [verifyAuth],
    schema: {
      tags: ["images"],
      summary: "Inspect and extract all EXIF, IPTC, and GPS metadata from an image",
      consumes: ["multipart/form-data"],
    },
    validatorCompiler: () => () => true,
  }, async (req, reply) => {
    const tempId = randomUUID();
    const workDir = path.join(STORAGE_PATH, "temp", "inspect", tempId);
    fs.mkdirSync(workDir, { recursive: true });

    let imagePath = null;
    let originalName = "image.jpg";

    try {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === "file" && part.fieldname === "image") {
          originalName = part.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
          const buf = await part.toBuffer();
          imagePath = path.join(workDir, originalName);
          fs.writeFileSync(imagePath, buf);
        }
      }

      if (!imagePath || !fs.existsSync(imagePath)) {
        return reply.code(400).send({ error: "No image file provided for inspection" });
      }

      const tags = await exiftool.read(imagePath);

      // Parse keywords into a clean array/string
      let kwString = "";
      if (Array.isArray(tags.Keywords)) {
        kwString = tags.Keywords.join(", ");
      } else if (typeof tags.Keywords === "string") {
        kwString = tags.Keywords;
      } else if (Array.isArray(tags.Subject)) {
        kwString = tags.Subject.join(", ");
      } else if (typeof tags.Subject === "string") {
        kwString = tags.Subject;
      }

      // Safely parse GPS coordinates
      const hasGps = tags.GPSLatitude !== undefined && tags.GPSLongitude !== undefined;
      const lat = hasGps ? Number(tags.GPSLatitude) : null;
      const lon = hasGps ? Number(tags.GPSLongitude) : null;
      let formattedCoords = null;
      if (hasGps && !isNaN(lat) && !isNaN(lon)) {
        formattedCoords = `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(5)}° ${lon >= 0 ? "E" : "W"}`;
      }

      // Format response
      const result = {
        filename: originalName,
        camera: {
          make: tags.Make || null,
          model: tags.Model || null,
          lens: tags.LensModel || tags.Lens || null,
          focalLength: tags.FocalLength ? `${tags.FocalLength}` : null,
          aperture: tags.FNumber ? `f/${tags.FNumber}` : null,
          shutterSpeed: tags.ExposureTime ? (typeof tags.ExposureTime === 'number' ? (tags.ExposureTime < 1 ? `1/${Math.round(1/tags.ExposureTime)}s` : `${tags.ExposureTime}s`) : `${tags.ExposureTime}s`) : null,
          iso: tags.ISO ? `${tags.ISO}` : null,
          software: tags.Software || null,
          dateTimeOriginal: tags.DateTimeOriginal ? String(tags.DateTimeOriginal) : null,
          exposureProgram: tags.ExposureProgram || null,
          meteringMode: tags.MeteringMode || null,
          whiteBalance: tags.WhiteBalance || null,
          flash: tags.Flash ? String(tags.Flash) : null,
          exposureCompensation: tags.ExposureCompensation ? `${tags.ExposureCompensation} EV` : null,
        },
        technical: {
          width: tags.ImageWidth || null,
          height: tags.ImageHeight || null,
          dimensions: tags.ImageWidth && tags.ImageHeight ? `${tags.ImageWidth}×${tags.ImageHeight}` : null,
          aspectRatio: tags.ImageWidth && tags.ImageHeight ? (tags.ImageWidth / tags.ImageHeight).toFixed(2) : null,
          megapixels: tags.Megapixels ? `${tags.Megapixels} MP` : (tags.ImageWidth && tags.ImageHeight ? `${(tags.ImageWidth * tags.ImageHeight / 1000000).toFixed(1)} MP` : null),
          colorSpace: tags.ColorSpace || null,
          mimeType: tags.MIMEType || null,
          fileSize: tags.FileSize || null,
        },
        iptc: {
          title: tags.Title || tags.ObjectName || "",
          author: tags.Artist || tags["By-line"] || tags.Creator || "",
          copyright: tags.Copyright || tags.CopyrightNotice || "",
          description: tags.ImageDescription || tags["Caption-Abstract"] || "",
          keywords: kwString,
          license: tags.WebStatement || "",
          acquireLicensePage: tags.LicensorURL || "",
          creditText: tags.Credit || "",
          datePublished: tags.DateCreated || tags.CreateDate ? String(tags.DateCreated || tags.CreateDate).split("T")[0] : "",
          locationName: tags.Location || tags["Sub-location"] || "",
        },
        gps: {
          hasGps,
          latitude: lat,
          longitude: lon,
          altitude: tags.GPSAltitude !== undefined ? `${tags.GPSAltitude}m` : null,
          formattedCoords,
        },
        hasAnyExif: Boolean(
          tags.Make || tags.Model || tags.LensModel || tags.FNumber || tags.ISO ||
          tags.Title || tags.Artist || tags.Copyright || hasGps
        ),
        rawTags: (() => {
          const raw = {};
          for (const [key, val] of Object.entries(tags)) {
            if (key.startsWith("errors") || key === "warnings" || typeof val === "function") continue;
            if (val === null || val === undefined) continue;
            if (typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
              try {
                raw[key] = JSON.stringify(val);
              } catch (_) {
                raw[key] = String(val);
              }
            } else if (Array.isArray(val)) {
              raw[key] = val.join(", ");
            } else {
              raw[key] = String(val);
            }
          }
          return raw;
        })()
      };

      // Cleanup temp workDir asynchronously
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch (_) {}

      return reply.send(result);
    } catch (err) {
      req.log.error(err);
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) {}
      return reply.code(500).send({ error: "Failed to inspect image metadata: " + err.message });
    }
  });

  // ─── Strip All EXIF & Metadata (Privacy Tool) ──────────────────────────────
  app.post("/images/metadata/strip", {
    preHandler: [verifyAuth],
    schema: {
      tags: ["images"],
      summary: "Remove all EXIF, GPS, and metadata from an image for privacy",
      consumes: ["multipart/form-data"],
    },
    validatorCompiler: () => () => true,
  }, async (req, reply) => {
    const jobId = randomUUID();
    const workDir = path.join(STORAGE_PATH, "metadata", jobId);
    fs.mkdirSync(workDir, { recursive: true });

    let imagePath = null;
    let safeName = "stripped_image.jpg";

    try {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === "file" && part.fieldname === "image") {
          safeName = "clean_" + part.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
          const buf = await part.toBuffer();
          imagePath = path.join(workDir, safeName);
          fs.writeFileSync(imagePath, buf);
        }
      }

      if (!imagePath || !fs.existsSync(imagePath)) {
        return reply.code(400).send({ error: "No image file uploaded" });
      }

      // Strip all tags completely
      await exiftool.write(imagePath, {}, ["-all=", "-overwrite_original"]);

      // Log to history
      try {
        const getDb = require("../db");
        const db = getDb();
        db.prepare(`
          INSERT INTO image_jobs (id, batch_id, status, original_filename, original_path, ai_provider, prompt, model, image_size, output_format, quality, image_count, operation_type, result_path)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          jobId,
          null,
          "completed",
          safeName,
          imagePath,
          "exiftool",
          "All EXIF & Metadata Stripped (Privacy Clean)",
          "EXIF Stripper",
          "Original",
          path.extname(imagePath).replace(".", "").toUpperCase(),
          "lossless",
          1,
          "metadata",
          imagePath
        );
      } catch (dbErr) {
        req.log.warn(`Failed to log strip job to history: ${dbErr.message}`);
      }

      const publicUrl = `/api/images/metadata/download/${jobId}/${safeName}`;
      return reply.send({
        message: "All EXIF and metadata successfully removed",
        url: publicUrl,
        filename: safeName,
      });
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: "Failed to strip metadata: " + err.message });
    }
  });

  app.get("/images/metadata/download/zip/:jobId", async (req, reply) => {
    const { jobId } = req.params;
    const filePath = path.join(STORAGE_PATH, "metadata", jobId, "metadata_images.zip");
    
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      reply.header("Content-Type", "application/zip");
      reply.header("Content-Disposition", `attachment; filename="metadata_images.zip"`);
      reply.header("Content-Length", stat.size);
      const stream = fs.createReadStream(filePath);
      return reply.send(stream);
    }
    return reply.code(404).send({ error: "File not found" });
  });

  app.get("/images/metadata/download/:jobId/:filename", async (req, reply) => {
    const { jobId, filename } = req.params;
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = path.join(STORAGE_PATH, "metadata", jobId, safeName);
    
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      reply.header("Content-Type", "application/octet-stream");
      reply.header("Content-Disposition", `attachment; filename="${safeName}"`);
      reply.header("Content-Length", stat.size);
      const stream = fs.createReadStream(filePath);
      return reply.send(stream);
    }
    return reply.code(404).send({ error: "File not found" });
  });

  // ─── Fetch Image from External URL (SSRF Protected) ───────────────────────
  app.post("/images/metadata/fetch-url", {
    preHandler: [verifyAuth],
    schema: {
      tags: ["images"],
      summary: "Download image from external URL to inspect or inject metadata",
      body: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string" }
        }
      }
    }
  }, async (req, reply) => {
    const { url } = req.body;
    if (!url || typeof url !== "string" || !url.startsWith("http")) {
      return reply.code(400).send({ error: "Please provide a valid http/https image URL" });
    }

    try {
      const response = await safeFetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "image/*,*/*;q=0.8"
        }
      });

      if (!response.ok) {
        return reply.code(400).send({ error: `Failed to download from URL: HTTP ${response.status} ${response.statusText}` });
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      if (!contentType.includes("image") && !contentType.includes("octet-stream")) {
        return reply.code(400).send({ error: "The provided URL did not return an image content-type (" + contentType + ")" });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0) {
        return reply.code(400).send({ error: "Downloaded file is empty (0 bytes)" });
      }

      // Determine appropriate filename and extension
      let filename = "downloaded_image.jpg";
      try {
        const parsed = new URL(url);
        const base = path.basename(parsed.pathname);
        if (base && base.includes(".") && !base.endsWith(".")) {
          filename = base;
        } else {
          const ext = contentType.split("/")[1]?.split("+")[0]?.split(";")[0] || "jpg";
          filename = `image_${Date.now()}.${ext}`;
        }
      } catch (_) {}

      // Validate magic bytes for proper format
      let safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      if (buffer.length > 12) {
        if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
            buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
          if (!safeName.toLowerCase().endsWith('.webp')) safeName = safeName.replace(/\.[^/.]+$/, "") + ".webp";
        } else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
          if (!safeName.toLowerCase().endsWith('.png')) safeName = safeName.replace(/\.[^/.]+$/, "") + ".png";
        } else if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
          if (!safeName.toLowerCase().match(/\.(jpg|jpeg)$/)) safeName = safeName.replace(/\.[^/.]+$/, "") + ".jpg";
        }
      }

      const base64 = `data:${contentType};base64,${buffer.toString("base64")}`;
      return reply.send({
        filename: safeName,
        mimeType: contentType,
        size: buffer.length,
        dataUrl: base64
      });
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: "Failed to download image from URL: " + err.message });
    }
  });
}

module.exports = metadataRoutes;
