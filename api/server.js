"use strict";

const Fastify = require("fastify");
const path = require("path");
const fs = require("fs");

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, "..", "storage");

// Ensure storage directories exist
for (const dir of ["videos", "frames", "transcripts", "results", "images", "music"]) {
  fs.mkdirSync(path.join(STORAGE_PATH, dir), { recursive: true });
}

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    transport:
      process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty" }
        : undefined,
  },
  bodyLimit: parseBytes(process.env.MAX_FILE_SIZE || "500mb"),
  trustProxy: true,
});

function parseBytes(str) {
  const units = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
  const match = String(str)
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) return 500 * 1024 * 1024;
  return Math.floor(parseFloat(match[1]) * (units[match[2]] || units.mb));
}

// Plugins
app.register(require("@fastify/cors"), {
  origin: process.env.CORS_ORIGIN || true,
});
app.register(require("@fastify/multipart"), {
  limits: {
    fileSize: parseBytes(process.env.MAX_FILE_SIZE || "500mb"),
  },
});
app.register(require("@fastify/rate-limit"), {
  max: parseInt(process.env.RATE_LIMIT_MAX || "1000", 10),
  timeWindow: "1 minute",
  allowList: (req) => {
    const url = (req.raw && req.raw.url) ? req.raw.url : (req.url || "");
    return url.includes("/images/preview/") || url.includes("/images/download") || url.includes("/images/batch/") || url.includes("/images/job/") || url.includes("/download");
  }
});

// Error handler middleware
const { errorHandlerPlugin } = require("./middleware/errorHandler");
app.register(errorHandlerPlugin);

// Swagger — must register before routes
app.register(require("@fastify/swagger"), {
  openapi: {
    openapi: "3.0.0",
    info: {
      title: "Media Studio API",
      description: "AI-powered video pipeline — upload videos or images, get YouTube metadata (title, description, tags, hashtags) powered by xAI / OpenAI / AWS Bedrock.",
      version: "1.0.0",
    },
    tags: [
      { name: "video", description: "Upload and process video files" },
      { name: "images", description: "Convert images to a slideshow and process" },
      { name: "jobs", description: "Job status, results, and management" },
      { name: "health", description: "Service health checks" },
    ],
  },
});

app.register(require("@fastify/swagger-ui"), {
  routePrefix: "/api/docs",
  uiConfig: {
    docExpansion: "list",
    deepLinking: true,
    displayRequestDuration: true,
  },
  staticCSP: true,
});

// Routes
app.register(require("./routes/health"), { prefix: "/" });
app.register(require("./routes/upload"), { prefix: "/api" });
app.register(require("./routes/jobs"), { prefix: "/api" });
app.register(require("./routes/imagesToVideo"), { prefix: "/api" });
app.register(require("./routes/videoResize"), { prefix: "/api" });
app.register(require("./routes/images/index"), { prefix: "/api" }); // modular images routes
app.register(require("./routes/metadata"), { prefix: "/api" });
app.register(require("./routes/settings"), { prefix: "/api" });
app.register(require("./routes/wordpress"), { prefix: "/api" });

// Start
const start = async () => {
  try {
    await app.listen({ port: 3000, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
