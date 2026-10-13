"use strict";

async function healthRoutes(app) {
  app.get("", {
    schema: {
      tags: ["health"],
      summary: "API overview",
      description: "Returns service info and all available endpoints.",
      response: {
        200: {
          type: "object",
          properties: {
            service: { type: "string" },
            version: { type: "string" },
            status: { type: "string" },
            endpoints: {
              type: "object",
              additionalProperties: { type: "string" },
            },
            timestamp: { type: "string", format: "date-time" },
          },
        },
      },
    },
  }, async () => {
    return {
      service: "Media Studio API",
      version: "1.0.0",
      status: "running",
      endpoints: {
        health: "GET /health",
        upload: "POST /api/upload",
        jobs: "GET /api/jobs/:jobId",
        jobRaw: "GET /api/jobs/:jobId/raw",
        jobResult: "GET /api/jobs/:jobId/result",
        jobTranscript: "GET /api/jobs/:jobId/transcript",
        imagesToVideo: "POST /api/images-to-video",
        imagesToVideoInfo: "GET /api/images-to-video/info",
      },
      timestamp: new Date().toISOString(),
    };
  });

  app.get("/health", {
    schema: {
      tags: ["health"],
      summary: "Health check",
      description: "Returns service health status.",
      response: {
        200: {
          type: "object",
          properties: {
            status: { type: "string", example: "ok" },
            service: { type: "string" },
            timestamp: { type: "string", format: "date-time" },
          },
        },
      },
    },
  }, async () => {
    return { status: "ok", service: "media-studio-api", timestamp: new Date().toISOString() };
  });
}

module.exports = healthRoutes;
