"use strict";

const wpService = require("../services/wordpress");
const { verifyAuth } = require("../middleware/auth");

async function wordpressRoutes(app) {
  app.get("/wordpress/types", { preHandler: [verifyAuth] }, async (req, reply) => {
    try {
      const types = await wpService.getPostTypes();
      return types;
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: err.message || "Failed to fetch WP post types" });
    }
  });

  app.get("/wordpress/posts", { preHandler: [verifyAuth] }, async (req, reply) => {
    const { type } = req.query; // Expects rest_base of type
    if (!type) return reply.code(400).send({ error: "Missing type parameter" });
    try {
      const posts = await wpService.getPosts(type);
      return posts;
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: err.message || "Failed to fetch WP posts" });
    }
  });

  app.get("/wordpress/media", { preHandler: [verifyAuth] }, async (req, reply) => {
    const { post } = req.query; // Post ID
    if (!post) return reply.code(400).send({ error: "Missing post parameter" });
    try {
      const media = await wpService.getMediaForPost(post);
      return media;
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: err.message || "Failed to fetch WP media" });
    }
  });
  app.get("/wordpress/proxy-image", { preHandler: [verifyAuth] }, async (req, reply) => {
    const { url } = req.query;
    if (!url) return reply.code(400).send({ error: "Missing url parameter" });
    
    try {
      const axios = require("axios");
      const response = await axios.get(url, { responseType: "arraybuffer" });
      
      reply.header("Content-Type", response.headers["content-type"]);
      reply.header("Content-Length", response.headers["content-length"]);
      
      return reply.send(Buffer.from(response.data));
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: "Failed to proxy image" });
    }
  });

  app.post("/wordpress/media", {
    preHandler: [verifyAuth],
    validatorCompiler: () => () => true, // disable body validation for multipart
  }, async (req, reply) => {
    try {
      const parts = req.parts();
      let fileData = null;
      let title, alt_text, caption, description, postId, replaceMediaId;

      for await (const part of parts) {
        if (part.type === "file") {
          const chunks = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          fileData = {
            buffer: Buffer.concat(chunks),
            filename: part.filename
          };
        } else {
          if (part.fieldname === "title") title = part.value;
          if (part.fieldname === "alt_text") alt_text = part.value;
          if (part.fieldname === "caption") caption = part.value;
          if (part.fieldname === "description") description = part.value;
          if (part.fieldname === "postId") postId = part.value;
          if (part.fieldname === "replaceMediaId") replaceMediaId = part.value;
        }
      }

      if (!fileData) {
        return reply.code(400).send({ error: "Missing file" });
      }

      const os = require("os");
      const path = require("path");
      const fs = require("fs");
      
      const tempPath = path.join(os.tmpdir(), `wp-upload-${Date.now()}-${fileData.filename}`);
      fs.writeFileSync(tempPath, fileData.buffer);
      
      let mediaId;
      try {
        mediaId = await wpService.uploadMedia(tempPath, postId, title, alt_text, caption, description);
        
        if (replaceMediaId) {
          try {
            if (postId) {
              await wpService.replaceMediaInPost(postId, replaceMediaId, mediaId);
            }
            await wpService.deleteMedia(replaceMediaId);
          } catch(e) {
            req.log.warn(`Failed to delete old media ${replaceMediaId}: ${e.message}`);
          }
        }
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }

      return { success: true, mediaId };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: err.response?.data?.message || err.message || "Failed to push media" });
    }
  });
}
module.exports = wordpressRoutes;
