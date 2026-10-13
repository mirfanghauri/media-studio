# Contributing to Media Studio 🎬✨

Thank you for your interest in contributing to **Media Studio**! Whether you want to fix a bug, enhance documentation, add support for a new AI provider, or build a new video/image processing operation, we welcome your contributions.

Please review this guide before submitting issues or pull requests.

---

## 📑 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Architecture Overview](#architecture-overview)
- [Local Development Setup](#local-development-setup)
- [Development Standards & Conventions](#development-standards--conventions)
- [How to Add a New AI Provider](#how-to-add-a-new-ai-provider)
- [How to Add a New Processing Operation](#how-to-add-a-new-processing-operation)
- [Dependency Management & Updates](#dependency-management--updates)
- [Pull Request & Release Workflow](#pull-request--release-workflow)
- [Security & Vulnerability Reporting](#security--vulnerability-reporting)

---

## Code of Conduct

We are committed to providing a friendly, safe, and welcoming environment for all contributors. Please treat everyone with respect, give constructive feedback, and keep discussions professional and inclusive.

---

## Architecture Overview

Media Studio consists of containerized microservices communicating over an internal Docker bridge network (`media-studio-network`):

```text
┌────────────────────────┐      ┌────────────────────────┐
│  frontend (React 18)   │ ──── │   api (Fastify 5.x)    │
│  Port 3501 (Nginx)     │      │   Port 3500            │
└────────────────────────┘      └───────────┬────────────┘
                                            │
                               ┌────────────┴────────────┐
                               ▼                         ▼
                     ┌──────────────────┐      ┌──────────────────┐
                     │ Redis 7 (BullMQ) │      │  SQLite Database │
                     └─────────┬────────┘      │(media_studio.db) │
                               │               └──────────────────┘
                               ▼
                     ┌──────────────────┐      ┌──────────────────┐
                     │  worker Engine   │ ──── │    imaginary     │
                     │  (FFmpeg/Whisper)│      │    (Libvips 9000)│
                     └──────────────────┘      └──────────────────┘
```

- **`api/`**: Fastify REST API gateway. Handles multipart uploads, JWT authentication, schema validation, BullMQ enqueuing, and OpenAPI Swagger documentation.
- **`worker/`**: BullMQ background workers processing CPU-heavy jobs (FFmpeg, Faster-Whisper, Sharp) and coordinating AI provider API calls (OpenAI, Azure, Vertex AI, xAI).
- **`frontend/`**: Vite + React 18 single-page application with Tailwind CSS, Lucide icons, and TanStack Table.
- **`dashboard/`**: Bull Board queue monitoring web application for real-time Redis queue telemetry.
- **`shared/`**: Common utilities, SQLite database connection helpers, and the AI token/image pricing engine.
- **`storage/`**: Shared volume mounted across containers for persistent media, SQLite files, frames, and audio transcripts.

---

## Local Development Setup

### Prerequisites
- **Docker Engine** $\ge$ 20.10 & **Docker Compose** v2
- **Node.js** 20.x LTS (if running processes outside Docker)
- **Git**

### Option 1: Live Hot-Reload with Docker Compose (Recommended)

To mount your local source code into the running containers for instantaneous hot-reloading:

```bash
# 1. Clone repository
git clone https://github.com/mirfanghauri/media-studio.git
cd media-studio

# 2. Copy and configure environment
cp .env.example .env

# 3. Start development stack with hot-reloading override
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

Any changes made in `api/`, `worker/`, `dashboard/`, or `frontend/` will immediately reflect without rebuilding images.

View live container logs:
```bash
docker compose logs -f api worker frontend
```

### Option 2: Running Services Bare-Metal for Debugging

You can run Redis and Imaginary in Docker while running the Node.js API and Worker directly on your host:

```bash
# Start background dependencies only
docker compose up -d redis imaginary

# Start Fastify API (Terminal 1)
cd api
npm install
npm run dev

# Start BullMQ Worker (Terminal 2)
cd worker
npm install
npm start

# Start Frontend (Terminal 3)
cd frontend
npm install
npm run dev
```

---

## Development Standards & Conventions

1. **Security & Secrets:**
   - **Never hardcode secrets, API keys, or private tokens.**
   - All credentials must be read from environment variables or the SQLite `app_settings` table.
   - Secrets are excluded via `.gitignore` and `.dockerignore`.
2. **Command Execution Safety:**
   - Always sanitize user inputs passed into shell commands (e.g. FFmpeg, ffprobe, curl). Use the `shellEscape()` utility function from `worker/processor.js` to prevent shell injection vulnerabilities.
3. **Storage & Path Hygiene:**
   - Write all output files within `STORAGE_PATH` (`/app/storage/...`).
   - Clean up temporary scratch frames and buffers in `finally` blocks when tasks complete or fail.
4. **Progress & Telemetry:**
   - Every background job should report incremental progress via `await job.updateProgress(percent)` and informational milestones via `job.log(...)`.

---

## How to Add a New AI Provider

Adding a new AI provider (e.g. Anthropic, Stability AI, Black Forest Labs Flux, Midjourney API, or AWS Bedrock image models) follows a modular pattern across 5 key steps.

### Step 1: Define Provider Credentials in SQLite Settings

Credentials can be configured via environment variables or the web Settings page.

1. Open `worker/utils/settings.js` and add getter helpers for the new provider credentials:
   ```javascript
   // worker/utils/settings.js
   function getProviderApiKey() {
     return getSetting("myprovider_api_key");
   }
   function getProviderBaseUrl() {
     return getSetting("myprovider_base_url", "https://api.myprovider.com/v1").replace(/\/$/, "");
   }
   function getProviderDefaultModel() {
     return getSetting("myprovider_default_model", "flux-1-pro");
   }

   module.exports = {
     // ... existing exports
     getProviderApiKey,
     getProviderBaseUrl,
     getProviderDefaultModel,
   };
   ```

2. Register the allowed settings keys in `api/routes/settings.js` so they can be saved via `POST /api/settings`:
   ```javascript
   const ALLOWED_SETTING_KEYS = [
     // ... existing keys
     "myprovider_api_key",
     "myprovider_base_url",
     "myprovider_default_model",
   ];
   ```

### Step 2: Add Cost & Pricing Rates

Open `shared/pricing.js` to register billing telemetry so users can track dollar spend and token counts:

```javascript
// shared/pricing.js -> PRICING_RATES
const PRICING_RATES = {
  // ... existing providers
  myprovider: {
    "flux-1-pro": { per_image: 0.050 },
    "flux-1-schnell": { per_image: 0.003 },
    default: 0.050,
  },
};
```

Update `calculateImageCost` in `shared/pricing.js` to parse your provider's usage telemetry (or compute flat per-image costs).

### Step 3: Implement the Provider Module

Create a new directory `worker/providers/myprovider/` with:
- `index.js`: Main export interface.
- `generate.js`: Text-to-image generation handler.
- `edit.js`: Inpainting / image editing handler.
- `metadata.js` *(optional)*: Vision / metadata analysis handler.

#### Example: `worker/providers/myprovider/generate.js`
```javascript
"use strict";

const axios = require("axios");
const { getProviderApiKey, getProviderBaseUrl, getProviderDefaultModel } = require("../../utils/settings");
const { withRetry } = require("../../utils/retry");

async function myproviderGenerate(job, jobData) {
  const { prompt, model, imageSize, quality, imageCount } = jobData;
  const apiKey = getProviderApiKey();
  const baseUrl = getProviderBaseUrl();
  const safeModel = model || getProviderDefaultModel();

  if (!apiKey) {
    throw new Error("MyProvider API key missing. Please configure it in Settings.");
  }

  job.log(`[MyProvider Generate] model=${safeModel} prompt="${prompt}"`);

  const response = await withRetry(async () => {
    return await axios.post(
      `${baseUrl}/images/generate`,
      {
        model: safeModel,
        prompt,
        width: 1024,
        height: 1024,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 180000,
      }
    );
  }, job, "MyProvider-Generate");

  // Map returned base64 or image URLs to Buffers
  const imageBuffers = response.data.images.map(img => Buffer.from(img.b64_json, "base64"));
  return imageBuffers;
}

module.exports = { myproviderGenerate };
```

#### Example: `worker/providers/myprovider/index.js`
```javascript
"use strict";

const { myproviderGenerate } = require("./generate");
const { myproviderEdit } = require("./edit");

module.exports = {
  myproviderGenerate,
  myproviderEdit,
};
```

### Step 4: Dispatch in Worker and API

1. In `worker/imageProcessor.js`, import the new provider:
   ```javascript
   const { myproviderGenerate, myproviderEdit } = require("./providers/myprovider");
   ```
2. Add a dispatch branch inside `processImageJob`:
   ```javascript
   } else if (aiProvider === "myprovider") {
     if (!getProviderApiKey()) {
       throw new Error("MyProvider API key missing. Please configure it in Settings.");
     }
     await job.updateProgress(15);
     if (operationType === "generate" || !originalPath) {
       imageBuffers = await myproviderGenerate(job, job.data);
     } else {
       imageBuffers = await myproviderEdit(job, job.data);
     }
     await job.updateProgress(60);
     if (imageBuffers[0]) savePartialImage(jobId, 0, imageBuffers[0]);
   ```

### Step 5: Expose in the Frontend Web App

1. In `frontend/src/pages/SettingsPage.jsx`, add input fields for the provider's API key, base URL, and default model.
2. In `frontend/src/components/studio/`, add the provider to the dropdown selector (`<option value="myprovider">MyProvider</option>`).

### Step 6: Verify and Test

Run the regression test suite:
```bash
./scripts/api-regression.sh
```

---

## How to Add a New Processing Operation

Adding a new processing operation (e.g. video subtitle burning, audio stem extraction, background removal, or GIF generation) follows a streamlined pipeline.

### Step 1: Select the Target Queue & Define the Job Payload

Media Studio uses BullMQ queues:
- **`video-processing`**: Handled by `worker/processor.js` (FFmpeg, Faster-Whisper, video utilities).
- **`image-processing`**: Handled by `worker/imageProcessor.js` (Libvips, Sharp, AI transformations).
- Or create a **custom queue** if isolation is required.

Determine your job payload schema:
```json
{
  "jobId": "uuidv4",
  "operation": "subtitle-burn",
  "sourceVideo": "/app/storage/videos/uuid/source.mp4",
  "subtitleFile": "/app/storage/transcripts/uuid.srt",
  "options": {
    "fontSize": 24,
    "fontColor": "white"
  }
}
```

### Step 2: Create Fastify API Route

Create `api/routes/subtitles.js` (or add to an existing route group):

```javascript
"use strict";

const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { Queue } = require("bullmq");
const { verifyAuth } = require("../middleware/auth");
const getDb = require("../db");

const videoQueue = new Queue("video-processing", {
  connection: {
    host: process.env.REDIS_HOST || "redis",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
  },
});

module.exports = async function (fastify, opts) {
  fastify.post("/subtitles/burn", { preHandler: [verifyAuth] }, async (request, reply) => {
    const { videoPath, srtPath, options } = request.body;
    const jobId = crypto.randomUUID();

    // Enqueue BullMQ job
    await videoQueue.add("burn-subtitles", {
      jobId,
      videoPath,
      srtPath,
      options: options || {},
    });

    return reply.status(202).send({
      success: true,
      jobId,
      message: "Subtitle burn job enqueued successfully",
      statusUrl: `/api/jobs/${jobId}`,
    });
  });
};
```

Register the route in `api/server.js`:
```javascript
fastify.register(require("./routes/subtitles"), { prefix: "/api" });
```

### Step 3: Implement Worker Handler

In `worker/processor.js`:

1. Define the processing logic:
   ```javascript
   async function processBurnSubtitles(job) {
     const { jobId, videoPath, srtPath, options = {} } = job.data;
     const outputDir = path.join(STORAGE_PATH, "videos", jobId);
     fs.mkdirSync(outputDir, { recursive: true });
     const outputPath = path.join(outputDir, "subtitled.mp4");

     await job.updateProgress(10);
     job.log("Starting subtitle burn-in with FFmpeg...");

     const ffmpegCmd = [
       "ffmpeg -y -hide_banner",
       `-i ${shellEscape(videoPath)}`,
       `-vf "subtitles=${shellEscape(srtPath)}:force_style='FontSize=24'"`,
       "-c:a copy",
       shellEscape(outputPath),
     ].join(" ");

     await execPromise(ffmpegCmd, 600000); // 10 min timeout

     await job.updateProgress(100);
     job.log("Subtitle burn-in complete!");

     return {
       jobId,
       outputPath,
       downloadUrl: `/storage/videos/${jobId}/subtitled.mp4`,
     };
   }
   ```

2. Register the handler in the BullMQ worker dispatcher:
   ```javascript
   const worker = new Worker("video-processing", async (job) => {
     if (job.name === "resize-video") {
       return processResizeVideo(job);
     }
     if (job.name === "burn-subtitles") {
       return processBurnSubtitles(job);
     }
     return processVideo(job);
   }, { connection, concurrency: CONCURRENCY });
   ```

### Step 4: Add Frontend UI & Status Polling

1. In the React frontend, call the new endpoint:
   ```javascript
   const res = await fetch("/api/subtitles/burn", {
     method: "POST",
     headers: {
       "Authorization": `Bearer ${token}`,
       "Content-Type": "application/json",
     },
     body: JSON.stringify({ videoPath, srtPath }),
   });
   const { jobId } = await res.json();
   ```
2. Track job progress using the existing `useJobPolling` hook:
   ```javascript
   import { useJobPolling } from "../hooks/useJobPolling";
   const { status, progress, result } = useJobPolling(jobId);
   ```

---

## Dependency Management & Updates

- **Automated Dependabot:** We use `.github/dependabot.yml` to automatically submit dependency updates for `api`, `worker`, `dashboard`, `frontend`, and Docker containers.
- **Manual Dependency Audit:**
  Run security vulnerability audits across all submodules:
  ```bash
  npm audit --prefix api
  npm audit --prefix worker
  npm audit --prefix dashboard
  npm audit --prefix frontend
  ```
- **Updating Dependencies:**
  ```bash
  npm update --prefix api
  npm update --prefix worker
  npm update --prefix dashboard
  npm update --prefix frontend
  ```
  Always run `./scripts/api-regression.sh` to ensure no breaking changes were introduced.

---

## Pull Request & Release Workflow

1. **Fork & Branch:** Create a feature branch with a descriptive name:
   ```bash
   git checkout -b feat/add-stability-ai-provider
   ```
2. **Follow Semantic Commit Messages:**
   - `feat:` New user-facing capability or provider
   - `fix:` Bug fix
   - `docs:` Documentation updates
   - `perf:` Performance improvements
   - `refactor:` Code restructuring without functional change
   - `ci:` Workflow and build system changes
3. **Submit Pull Request:**
   - Link any related GitHub issue.
   - Provide clear reproduction steps or testing screenshots/cURL outputs.
   - Verify that containers build cleanly without warnings.
4. **Versioned Releases:**
   - Media Studio uses Semantic Versioning (`MAJOR.MINOR.PATCH`).
   - Merges to `main` tagged with `v*` trigger the automated Docker publishing workflow, building multi-arch versioned images (`1.0.0`, `1.0`, `1`, `latest`).

---

## Security & Vulnerability Reporting

If you identify a security vulnerability, **do NOT open a public GitHub issue**. Please review our [Security Policy](SECURITY.md) for instructions on private, responsible disclosure.

