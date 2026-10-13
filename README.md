# Media Studio 🎬✨

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker Compose](https://img.shields.io/badge/Docker%20Compose-v2%2B-blue?logo=docker)](docker-compose.yml)
[![Node.js](https://img.shields.io/badge/Node.js-20%20LTS-green?logo=node.js)](https://nodejs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.x-black?logo=fastify)](https://fastify.dev/)
[![React](https://img.shields.io/badge/React-18-blue?logo=react)](https://react.dev/)
[![BullMQ](https://img.shields.io/badge/BullMQ-Redis%20Queue-red?logo=redis)](https://bullmq.io/)
[![Faster-Whisper](https://img.shields.io/badge/Faster--Whisper-int8%20Optimized-orange)](https://github.com/SYSTRAN/faster-whisper)

A high-performance, containerized media generation, video processing, and transformation studio. Media Studio unifies **Fastify**, **BullMQ**, **React (Vite)**, **Imaginary (Libvips)**, **FFmpeg**, and multi-provider AI engines (**OpenAI Direct**, **Azure OpenAI**, **Google Vertex AI**, **AWS Bedrock**, and **xAI Grok**) into an automated production pipeline.

---

## 📑 Table of Contents

- [🌟 Features & Capabilities](#-features--capabilities)
- [🏗️ System Architecture](#️-system-architecture)
- [📦 Microservices Overview](#-microservices-overview)
- [💻 Supported Operating Systems & Hardware](#-supported-operating-systems--hardware)
- [🏷️ Versioned Docker Images & Release Management](#️-versioned-docker-images--release-management)
- [💳 Feature Matrix: Free vs Paid API Credentials](#-feature-matrix-free-vs-paid-api-credentials)
- [🚀 Quick Start & Installation](#-quick-start--installation)
- [⚙️ Configuration & Environment Variables](#️-configuration--environment-variables)
- [🔑 AI Provider Setup & Credentials](#-ai-provider-setup--credentials)
- [💻 API Reference & Usage Guide](#-api-reference--usage-guide)
  - [1. Authentication](#1-authentication)
  - [2. AI Image Inpainting & Editing](#2-ai-image-inpainting--editing)
  - [3. Text-to-Image Generation](#3-text-to-image-generation)
  - [4. OpenAI Batch API Mode (50% Cost Savings)](#4-openai-batch-api-mode-50-cost-savings)
  - [5. Zero-AI Format Conversion & Resizing (Libvips)](#5-zero-ai-format-conversion--resizing-libvips)
  - [6. EXIF/IPTC Image Metadata Injection](#6-exifiptc-image-metadata-injection)
  - [7. Dynamic Image-to-Video Slideshow](#7-dynamic-image-to-video-slideshow)
  - [8. Remote Video Resizing & Compression](#8-remote-video-resizing--compression)
  - [9. Video Transcription & YouTube SEO Pipeline](#9-video-transcription--youtube-seo-pipeline)
  - [10. Brand Logo & Watermark Management](#10-brand-logo--watermark-management)
  - [11. WordPress REST API Synchronization](#11-wordpress-rest-api-synchronization)
- [📊 Queue Monitoring & Live Telemetry](#-queue-monitoring--live-telemetry)
- [🔧 Operations, Maintenance & Troubleshooting](#-operations-maintenance--troubleshooting)
- [🤝 Contributing & Extensibility](#-contributing--extensibility)
- [🛡️ Security Policy & Vulnerability Reporting](#️-security-policy--vulnerability-reporting)
- [📄 License](#-license)

---

## 🌟 Features & Capabilities

### 🎨 AI Image Studio
- **Multi-Provider AI Routing:** Route image generation and multipart inpainting seamlessly across **OpenAI** (`gpt-image-2`, DALL-E), **Azure OpenAI**, **Google Vertex AI** (`imagen-3`, `gemini-3.1-flash-image`, `gemini-3-pro-image`), and **xAI Grok** (`grok-imagine-image-2.0`).
- **OpenAI Batch API (50% Cost Discount):** Automatic or explicit queuing of asynchronous Batch API requests for cost-effective bulk operations.
- **Brand Watermarking & Logo Injection:** Auto-inject brand logos with customizable positioning (`bottom-right`, `bottom-left`, `top-right`, `top-left`, `center`), scale ratio, margin, and opacity.
- **EXIF/IPTC Metadata Injection:** Lossless metadata injection into output images (Title, Description, Keywords, Copyright, Author).

### ⚡ Zero-AI Format Conversion & Resizing
- **Libvips Engine via Imaginary:** Convert images among **WebP**, **AVIF**, **JPEG**, and **PNG** at near-instant C-level performance.
- **Advanced Resizing Behaviors:**
  - `fit` *(default)*: Proportional scaling within target dimensions (preserves aspect ratio).
  - `fill`: Aspect-filling zoom and center crop to exact dimensions.
  - `crop`: Precise bounding-box extraction.
- **Quality & Compression Controls:** Configurable compression levels (1–100) and lossless options.
- **Zero Cost & Zero Tokens:** Billed at **$0.00** in database telemetry.

### 🎥 Video & Slideshow Pipeline
- **Dynamic Image-to-Video Slideshow:** Upload up to 100 images to generate smooth, cross-faded or hard-cut MP4 videos.
- **Custom Audio & Transitions:** Attach background music tracks or choose from sample tracks; customize slide duration and transition effects.
- **Aspect Ratio Presets:** Render in `1280:720` (720p), `1920:1080` (1080p landscape), `1080:1920` (9:16 vertical for Shorts / Reels / TikTok), or `720:720` (1:1 square).
- **Remote Video Optimization & Compression:** Compress remote videos via URL with FFmpeg CRF presets (18–40), encoding presets (`ultrafast` to `veryslow`), and custom dimensions.

### 🎙️ Audio Transcription & YouTube SEO Metadata
- **Faster-Whisper Engine:** CPU-optimized int8 audio transcription powered by CTranslate2 (supports `tiny`, `base`, `small`, `medium`).
- **Multimodal Video Frame Extraction:** Evenly samples video frames across timestamps.
- **Automated YouTube Metadata:** Feeds extracted video frames and audio transcripts to vision AI to generate click-worthy YouTube titles, SEO descriptions, ranked tags, and hashtags.

### 🌐 Modern React Studio SPA
- **Clean Single-Page Application:** Built with React 18, Vite, Tailwind CSS, Lucide Icons, and TanStack Table.
- **Studio Workspace:** Multi-file drag-and-drop, real-time prompt enhancement, provider selector, quality presets, and inline comparisons.
- **Interactive History Explorer:** View past jobs in responsive table or grid mode with token counts, cost telemetry, modal preview drawers, single download, and bulk ZIP exports.
- **Light / Dark Mode Support:** Full theme toggle support.

---

## 🏗️ System Architecture

<details>
<summary><b>Click to expand System Architecture Diagram</b></summary>
<br>

```text
┌────────────────────────────────────────────────────────────────────────┐
│                      Media Studio Web Frontend                         │
│                    (React 18 + Vite + Tailwind CSS)                    │
│                      Mapped: http://localhost:3501                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST & JWT Auth
┌───────────────────────────────────▼────────────────────────────────────┐
│                       Fastify API Gateway (Node 20)                    │
│             - Multipart File Uploads & Request Validation              │
│             - OpenAPI / Swagger UI on /api/docs                        │
│             - Rate Limiting, Error Handling & Authentication           │
│                      Mapped: http://localhost:3500                     │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
         Enqueue    │ Job Data           Read / Write│ Config & History
                    ▼                                ▼
     ┌──────────────────────────────┐     ┌──────────────────────────────┐
     │      Redis 7 (AOF Queue)     │     │      SQLite (WAL Mode)       │
     │      media-studio-redis      │     │     media_studio.sqlite      │
     └──────────────┬───────────────┘     └──────────────────────────────┘
                    │
         Dequeue    │ Tasks (videoQueue & imageQueue)
                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Worker Engine (BullMQ)                          │
│                                                                        │
│   ┌───────────────────────────┐      ┌─────────────────────────────┐   │
│   │    Image Processor        │      │       Video Processor       │   │
│   │ - OpenAI / Azure OpenAI   │      │ - FFmpeg Encoder / Filters  │   │
│   │ - Vertex AI (Imagen/Gemini│      │ - Faster-Whisper (int8 CPU) │   │
│   │ - xAI Grok Imagine        │      │ - Frame Extractor           │   │
│   │ - Sharp / Watermarking    │      │ - YouTube AI Generator      │   │
│   └─────────────┬─────────────┘      └─────────────────────────────┘   │
└─────────────────┼──────────────────────────────────────────────────────┘
                  │
                  ▼ HTTP internal (9000)
┌───────────────────────────────────┐
│       Imaginary (Libvips)         │
│  - Zero-AI format convert         │
│  - High-speed resizing & crop     │
└───────────────────────────────────┘
```

</details>

---

## 📦 Microservices Overview

All services run inside a dedicated internal bridge network (`media-studio-network`):

| Service | Container Name | Port Mapping | Description |
| :--- | :--- | :--- | :--- |
| **`frontend`** | `media-studio-frontend` | `127.0.0.1:3501:80` | React single-page application served via optimized Nginx reverse proxy. |
| **`api`** | `media-studio-api` | `127.0.0.1:3500:3000` | Fastify REST API gateway with multipart uploads, Swagger docs, and routing. |
| **`worker`** | `media-studio-worker` | *Internal* | BullMQ worker executing FFmpeg, Faster-Whisper, and AI image transformations. |
| **`queue-monitor`**| `media-studio-queue-monitor`| `127.0.0.1:3502:3001` | Bull Board visual web dashboard for managing and inspecting BullMQ jobs. |
| **`redis`** | `media-studio-redis` | *Internal (6379)* | In-memory message broker with AOF persistence for reliable job processing. |
| **`imaginary`** | `media-studio-imaginary` | `127.0.0.1:9000:9000` | Libvips-backed microservice for high-speed format conversion and cropping. |

---

## 💻 Supported Operating Systems & Hardware

<details>
<summary><b>Click to expand OS compatibility matrix & Hardware benchmarks</b></summary>
<br>

### 🖥️ Supported Operating Systems

| Operating System | Compatibility | Recommended Runtime | Notes |
| :--- | :---: | :--- | :--- |
| **Ubuntu / Debian** | :white_check_mark: **Tier 1** | Docker Engine 24+ & Compose v2 | Ubuntu 20.04/22.04/24.04 LTS, Debian 11/12 (x86_64 & arm64). Primary production target. |
| **RHEL / Rocky / AlmaLinux** | :white_check_mark: **Tier 1** | Docker CE or Podman 4+ | RHEL 8/9, Rocky Linux 8/9. Ensure SELinux volume permissions (`:z`) if applicable. |
| **macOS (Apple Silicon)** | :white_check_mark: **Tier 1** | Docker Desktop or OrbStack | Native ARM64 container execution on M1/M2/M3/M4 Macs with Rosetta 2 emulation disabled. |
| **macOS (Intel x86_64)** | :white_check_mark: **Tier 2** | Docker Desktop | Supported on macOS 12 Monterey or newer. |
| **Windows 10 / 11 (64-bit)** | :white_check_mark: **Tier 1** | Docker Desktop with WSL 2 backend | Requires WSL 2 (Ubuntu distribution). Do not run inside legacy Hyper-V or Windows containers. |
| **Alpine Linux (Bare metal)** | :information_source: Containerized | Docker Engine | All microservice base images run alpine/slim containers out of the box. |

### ⚙️ Tested Hardware Specifications

| Resource Tier | CPU / Cores | System RAM | Disk Space | Recommended Concurrency | Target Workload |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **Minimum Tested** | 2 vCPUs (x86_64 / ARM64) | **4 GB RAM** *(+2 GB swap)* | **15 GB SSD** | `WORKER_CONCURRENCY=1` | Basic image generation, format conversion, small Whisper models (`tiny`/`base`). |
| **Recommended Production** | 4 vCPUs / 4 Cores | **8 GB – 16 GB RAM** | **40 GB NVMe** | `WORKER_CONCURRENCY=2` | Full 1080p FFmpeg encoding, slideshow synthesis, Faster-Whisper (`small`/`medium`). |
| **High-Throughput Enterprise** | 8+ vCPUs / 8+ Cores | **32 GB+ RAM** | **100 GB+ NVMe** | `WORKER_CONCURRENCY=4+` | Heavy batch processing, simultaneous 4K video transcoding, multi-tenant queues. |

> [!TIP]
> **RAM & Swap Recommendation for Faster-Whisper:**
> CPU-based int8 Faster-Whisper inference requires approximately 1.5 GB RAM for the `small` model and 2.5 GB RAM for the `medium` model during active transcription. If running on a 4 GB RAM VPS, always ensure a 2 GB swap file is configured (`swapon --show`) and set `WORKER_CONCURRENCY=1` in `.env` to prevent out-of-memory kernel termination.

</details>

---

## 🏷️ Versioned Docker Images & Release Management

<details>
<summary><b>Click to expand Docker image tags & release strategy</b></summary>
<br>

Media Studio publishes versioned Docker images to **Docker Hub** under the `irfanghori/media-studio-*` namespace with explicit **Semantic Versioning (`MAJOR.MINOR.PATCH`)** tags.

### 🛡️ Why Pin to Versioned Tags?

Relying exclusively on a mutable `:latest` tag in production environments can cause unexpected downtime or regressions when new container images are automatically pulled. Media Studio supports explicit release pinning in `docker-compose.yml`:

```env
# In your .env file:
MEDIA_STUDIO_VERSION=1.0.3
```

### Published Docker Image Tags

For every release, four Docker Hub images (`api`, `worker`, `queue-monitor`, `frontend`) are published with the following tag hierarchy:

| Tag Pattern | Example | Mutability | Recommended Use Case |
| :--- | :--- | :---: | :--- |
| `MAJOR.MINOR.PATCH` | `1.0.3` | **Immutable** | **Production deployments.** Guaranteed byte-identical image across all nodes. |
| `MAJOR.MINOR` | `1.0` | Semi-mutable | Automatically receives non-breaking patch releases within the minor branch. |
| `MAJOR` | `1` | Semi-mutable | Automatically receives minor and patch updates for major version 1. |
| `sha-<commit>` | `sha-8f8a460` | **Immutable** | Staging, auditing, and pinpoint rollback to an exact Git commit. |
| `latest` | `latest` | Mutable | Local evaluations, development environments, and quick demos. |

### Building & Publishing Versioned Images

Maintainers and self-hosters can build and publish versioned images using the included publishing script:

```bash
# Build all 4 service images locally with version 1.0.3, 1.0, 1, and sha tags:
./scripts/publish-docker.sh 1.0.3

# Build and push directly to Docker Hub:
./scripts/publish-docker.sh 1.0.3 --push
```

Every push of a `v*` tag (e.g. `v1.0.3`) to the GitHub repository automatically triggers the [Docker Publish GitHub Actions Workflow](.github/workflows/docker-publish.yml).

</details>

---

## 💳 Feature Matrix: Free vs Paid API Credentials

<details>
<summary><b>Click to expand full Feature & Cost Matrix (Free vs Cloud AI)</b></summary>
<br>

Media Studio combines high-speed, zero-cost local media operations with optional cloud AI engines. The table below outlines which operations run **100% free and self-hosted** versus those requiring **paid cloud API credentials**:

| Feature / Operation | Pipeline Component | Requires Paid API? | Required Credentials | Free / Self-Hosted Alternative | Estimated Cost |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **Zero-AI Format Conversion** (WebP, AVIF, PNG, JPEG) | Imaginary / Libvips | **No (100% Free)** | *None* | Runs entirely locally inside `imaginary` container | **$0.00** |
| **Image Resizing & Cropping** (fit, fill, crop) | Imaginary & Sharp | **No (100% Free)** | *None* | Runs entirely locally on CPU | **$0.00** |
| **Dynamic Video Slideshow** (Up to 100 images + audio) | FFmpeg Encoder | **No (100% Free)** | *None* | Runs entirely locally inside `worker` container | **$0.00** |
| **Remote Video Compression & CRF Scaling** | FFmpeg Encoder | **No (100% Free)** | *None* | Runs entirely locally inside `worker` container | **$0.00** |
| **Audio Transcription** (Speech-to-Text) | Faster-Whisper (int8) | **No (100% Free)** | *None* | Local CTranslate2 int8 inference on CPU | **$0.00** |
| **Multimodal Video Frame Extraction** | FFmpeg Frame Sampler | **No (100% Free)** | *None* | Runs entirely locally inside `worker` container | **$0.00** |
| **Brand Watermarking & Logo Injection** | Sharp Compositing | **No (100% Free)** | *None* | Runs entirely locally inside `worker` container | **$0.00** |
| **EXIF / IPTC Metadata Injection** | Sharp & ExifTool | **No (100% Free)** | *None* | Runs entirely locally inside `worker` container | **$0.00** |
| **BullMQ Queue Monitoring Dashboard** | Bull Board / Redis | **No (100% Free)** | *None* | Self-hosted visual web UI (`:3502`) | **$0.00** |
| **WordPress REST Media Synchronization** | Fastify WordPress Service | **No (100% Free)** | WordPress App Password | Self-hosted WordPress REST API | **$0.00** |
| **AI Text-to-Image Generation** (OpenAI) | OpenAI `gpt-image-2`, DALL-E | **Yes** | `openai_api_key` | Use local Libvips conversion or self-hosted models | ~$0.02 – $0.08 / img |
| **AI Image Inpainting & Mask Editing** (OpenAI) | OpenAI Multipart API | **Yes** | `openai_api_key` | Local Sharp cropping / watermarking | ~$0.02 – $0.08 / img |
| **OpenAI Batch API Mode** (50% Discount) | OpenAI Batch Queue | **Yes** | `openai_api_key` | Synchronous generation | 50% off standard OpenAI |
| **AI Image Generation & Edit** (Azure OpenAI) | Azure OpenAI Service | **Yes** | `azure_endpoint`, `azure_api_key` | OpenAI Direct or self-hosted | Based on Azure tier |
| **AI Image Generation** (Vertex Imagen 3 / Gemini) | Google Cloud Vertex AI | **Yes** | `vertex-sa-key.json`, GCP Project | OpenAI Direct or self-hosted | ~$0.02 – $0.06 / img |
| **AI Image Generation & Edit** (xAI Grok Imagine) | xAI Grok API | **Yes** | `xai_api_key` | OpenAI Direct or self-hosted | ~$0.02 – $0.05 / img |
| **Agent Brain Multi-Step Orchestration** | OpenAI / Azure LLM | **Yes** | OpenAI or Azure API Key | Manual prompt tuning in web UI | ~$0.001 / request |
| **YouTube AI SEO Title, Tag & Description** | Multimodal Vision LLM | **Yes** | OpenAI, Azure, or Vertex Key | Local Faster-Whisper raw transcript output | ~$0.005 / video |

</details>

---

## 🚀 Quick Start & Installation

### 1. Prerequisites
- **Docker Engine:** $\ge$ 20.10
- **Docker Compose:** v2 (`docker compose`)
- **System Memory:** Minimum 4 GB RAM recommended (for FFmpeg and Whisper model inference)
- **Disk Space:** Minimum 10 GB free space for Docker images, audio models, and temporary processing buffers

---

### Choose Your Installation Method:

### 🌟 Option A: Instant Start with Ready Docker Images (Recommended)

Pre-built images are published directly on **Docker Hub** under `irfanghori/media-studio-*`. You can start immediately without cloning the source code or compiling dependencies.

#### Step 1: Download Compose & Environment Template
```bash
mkdir media-studio && cd media-studio

# Download production docker-compose.yml and .env.example
curl -O https://raw.githubusercontent.com/mirfanghauri/media-studio/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/mirfanghauri/media-studio/main/.env.example
cp .env.example .env
```

#### Step 2: Configure Credentials
Edit `.env` to set your admin password and JWT secret:
```bash
JWT_SECRET=replace_with_a_secure_random_secret_key_32_chars
ADMIN_PASSWORD=your_strong_admin_password
```

#### Step 3: Pull & Launch
```bash
# Pulls pre-built images from Docker Hub and starts all 6 microservices
docker compose up -d
```

---

### 🛠️ Option B: Build from Source / Repository

<details>
<summary><b>Click to expand instructions for building from source</b></summary>
<br>

Ideal if you want to inspect or modify the code, customize dependencies, or develop locally.

#### Step 1: Clone Repository
```bash
git clone https://github.com/mirfanghauri/media-studio.git
cd media-studio
cp .env.example .env
```

#### Step 2: Configure Environment
Edit `.env` to configure your credentials and port mappings:
```bash
# Security & Authentication (Change these before deploying!)
JWT_SECRET=replace_with_a_secure_random_secret_key_32_chars
ADMIN_PASSWORD=your_strong_admin_password

# Port Mappings (Host : Container)
API_PORT=3500
FRONTEND_PORT=3501
QUEUE_MONITOR_PORT=3502
```

#### Step 3: Build & Launch
```bash
# Builds all service images locally and starts them
docker compose up -d --build
```

> **Tip for Local Developers:** To enable live source-code hot-reloading across the API, frontend, worker, and dashboard, run:
> ```bash
> docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
> ```

#### Step 4: Verify Deployment
Check the status of running containers:
```bash
docker compose ps
```

Verify the API health check:
```bash
curl -s http://localhost:3500/health | jq .
```
Expected output:
```json
{
  "status": "ok",
  "redis": "connected",
  "uptime": 12.34
}
```

</details>

---

### 3. Access URLs

- **Studio Web Interface:** [http://localhost:3501](http://localhost:3501)
- **API Gateway:** [http://localhost:3500](http://localhost:3500)
- **Interactive Swagger Docs:** [http://localhost:3500/api/docs](http://localhost:3500/api/docs)
- **BullMQ Queue Monitor:** [http://localhost:3502](http://localhost:3502)

---

## ⚙️ Configuration & Environment Variables

<details>
<summary><b>Click to expand Environment Variables table</b></summary>
<br>

| Variable | Default | Description |
| :--- | :--- | :--- |
| `MEDIA_STUDIO_VERSION` | `1.0.3` | Pinned Docker image version tag (e.g. `1.0.3` or `latest`). |
| `NODE_ENV` | `production` | Node runtime environment (`production` or `development`). |
| `STORAGE_PATH` | `/app/storage` | Internal container path for runtime media, jobs, and SQLite database. |
| `REDIS_HOST` | `redis` | Redis container host. |
| `REDIS_PORT` | `6379` | Redis port. |
| `IMAGINARY_URL`| `http://imaginary:9000` | Libvips imaginary microservice endpoint. |
| `MAX_FILE_SIZE`| `500mb` | Maximum file upload size allowed by Fastify body parser. |
| `WORKER_CONCURRENCY` | `2` | Number of simultaneous background jobs processed per worker. |
| `JWT_SECRET` | *(Required)* | 32+ character random secret used to sign and verify JWT tokens. |
| `ADMIN_PASSWORD` | *(Required)* | Master admin password for `/api/auth/login`. |
| `API_PORT` | `3500` | Host port mapped to the Fastify API. |
| `FRONTEND_PORT`| `3501` | Host port mapped to the React web app. |
| `QUEUE_MONITOR_PORT` | `3502` | Host port mapped to the Bull Board monitor. |

</details>

---

## 🔑 AI Provider Setup & Credentials

<details>
<summary><b>Click to expand AI Provider Configuration details</b></summary>
<br>

All AI credentials can be managed dynamically at runtime via the **Settings** page in the web UI or via `POST /api/settings`. Settings are stored securely in the local SQLite database (`storage/media_studio.sqlite`).

### Supported Providers:

1. **OpenAI Direct:**
   - Keys: `openai_api_key`, `openai_base_url` (default: `https://api.openai.com/v1`)
   - Default Models: `gpt-image-2`, `dall-e-3`
2. **Azure OpenAI:**
   - Keys: `azure_endpoint`, `azure_api_key`, `azure_api_version`, `azure_image_model`
3. **Google Vertex AI:**
   - Credentials: Mount or place your Google Cloud Service Account JSON file at `vertex-sa-key.json` in the project root.
   - Keys: `vertex_project_id`, `vertex_location` (default: `us-central1` or `global`)
   - Supported Models: `imagen-3.0-generate-002`, `imagen-3.0-fast-generate-001`, `gemini-3.1-flash-image`, `gemini-3-pro-image`
4. **AWS Bedrock:**
   - Keys: `aws_access_key_id`, `aws_secret_access_key`, `aws_region` (default: `us-east-1`)
   - Supports SigV4 request signing for multimodal Claude & Titan models.
5. **xAI Grok Imagine:**
   - Keys: `xai_api_key`, `xai_base_url` (default: `https://api.x.ai/v1`)
   - Default Models: `grok-imagine-image-2.0`

</details>

---

## 💻 API Reference & Usage Guide

<details>
<summary><b>Click to expand full REST API endpoints & code examples</b></summary>
<br>

### 1. Authentication

Most image generation and administrative endpoints require a Bearer token.

#### Login & Retrieve JWT:
```bash
curl -X POST "http://localhost:3500/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"password": "your_strong_admin_password"}'
```
Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
*Export this token to use in subsequent commands:*
```bash
export TOKEN="your_jwt_token_here"
```

---

### 2. AI Image Inpainting & Editing

Submit an existing image with an inpainting / instruction prompt.

```bash
curl -X POST "http://localhost:3500/api/images/edit" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/source.png" \
  -F "aiProvider=openai" \
  -F "model=gpt-image-2" \
  -F "operationType=edit" \
  -F "prompt=Add modern Scandinavian interior furniture with warm ambient lighting" \
  -F "outputFormat=webp" \
  -F "quality=high"
```
Response:
```json
{
  "batchId": "65b790d9-0b1a-4286-90c7-d4fa4c49df5c",
  "queued": 1,
  "jobs": [
    {
      "jobId": "f784d1e2-b92c-4977-9964-f6b974a9eb48",
      "filename": "source.png",
      "status": "queued"
    }
  ]
}
```

---

### 3. Text-to-Image Generation

Generate a new image from scratch using text prompts.

```bash
curl -X POST "http://localhost:3500/api/images/generate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Architectural photography of a luxury beachfront villa at sunset, 8k resolution, minimalist design",
    "aiProvider": "vertex",
    "model": "imagen-3.0-generate-002",
    "imageSize": "1920x1080",
    "outputFormat": "webp",
    "applyLogo": false
  }'
```

---

### 4. OpenAI Batch API Mode (50% Cost Savings)

When immediate real-time response is not required, enable `processingMode=batch`. Media Studio bundles the job into the OpenAI Batch queue, checks for completion, downloads the result, and logs 50% discount pricing in telemetry:

```bash
curl -X POST "http://localhost:3500/api/images/edit" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/property.png" \
  -F "aiProvider=openai" \
  -F "model=gpt-image-2" \
  -F "operationType=edit" \
  -F "processingMode=batch" \
  -F "prompt=Enhance garden landscaping with lush tropical plants and soft lighting"
```

---

### 5. Zero-AI Format Conversion & Resizing (Libvips)

Convert formats and resize images without using AI tokens or external APIs.

```bash
curl -X POST "http://localhost:3500/api/images/edit" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/photo.jpg" \
  -F "operationType=convert" \
  -F "outputFormat=webp" \
  -F "imaginaryResize=1920x1080" \
  -F "imaginaryResizeBehavior=fit" \
  -F "imaginaryCompressionLevel=75"
```

#### Supported Resize Behaviors:
- `fit`: Scales proportionally so the image fits entirely within the dimensions (default).
- `fill`: Crops to completely fill the target dimensions.
- `crop`: Exact bounding-box cut.

---

### 6. EXIF/IPTC Image Metadata Injection

Inject custom authorship, copyright, and SEO metadata into output images losslessly:

```bash
curl -X POST "http://localhost:3500/api/images/metadata/inject" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "f784d1e2-b92c-4977-9964-f6b974a9eb48",
    "title": "Modern Seaside Estate",
    "description": "Architectural showcase of luxury seaside property",
    "keywords": ["real estate", "architecture", "luxury villa", "coastal"],
    "copyright": "Copyright 2026 Media Studio. All rights reserved.",
    "author": "Media Studio Team"
  }'
```

---

### 7. Dynamic Image-to-Video Slideshow

Combine multiple image slides into an FFmpeg slideshow video with optional audio and transitions.

```bash
curl -X POST "http://localhost:3500/api/images-to-video" \
  -F "images=@slide1.jpg" \
  -F "images=@slide2.jpg" \
  -F "images=@slide3.jpg" \
  -F "duration=3" \
  -F "transition=fade" \
  -F "resolution=1920:1080" \
  -F "music=@audio.mp3" \
  -F "skipAI=true"
```
Response:
```json
{
  "jobId": "a190ef2a-1981-4fe6-a97e-ccae51d18f50",
  "message": "Slideshow queued for processing",
  "skipAI": true
}
```

---

### 8. Remote Video Resizing & Compression

Download and compress a remote video to optimized H.264 MP4:

```bash
curl -X POST "http://localhost:3500/api/video/resize" \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://example.com/videos/sample.mp4",
    "width": 1280,
    "crf": 26,
    "preset": "fast",
    "audioBitrate": "128k",
    "outputName": "optimized_web.mp4"
  }'
```

---

### 9. Video Transcription & YouTube SEO Pipeline

Upload a raw video file to extract frames, run Faster-Whisper audio transcription, and generate AI-powered YouTube metadata:

```bash
curl -X POST "http://localhost:3500/api/upload" \
  -F "file=@presentation.mp4" \
  -F "whisperModel=base" \
  -F "framesPerSecond=1" \
  -F "maxFrames=30" \
  -F "aiProvider=openai"
```

#### Poll Video Job Result:
```bash
curl -s "http://localhost:3500/api/jobs/<jobId>" | jq .
```
When complete, retrieve the generated metadata:
```bash
curl -s "http://localhost:3500/api/jobs/<jobId>/result" | jq .
```
Sample result:
```json
{
  "title": "Touring The Most Luxurious Oceanfront Villa | Architecture Showcase",
  "description": "Discover this breathtaking modern villa with floor-to-ceiling glass...",
  "tags": ["luxury homes", "modern architecture", "villa tour", "real estate"],
  "hashtags": ["#Architecture", "#LuxuryLiving", "#HomeTour"],
  "transcript": [
    { "start": 0.0, "end": 3.5, "text": "Welcome to today's exclusive tour." }
  ]
}
```

#### Download Processed Video or Transcript:
- **Download Video:** `GET http://localhost:3500/api/jobs/<jobId>/download`
- **Download Transcript:** `GET http://localhost:3500/api/jobs/<jobId>/transcript`

---

### 10. Brand Logo & Watermark Management

Upload a brand watermark logo to overlay onto generated or edited images:

#### Upload Logo:
```bash
curl -X POST "http://localhost:3500/api/images/logo" \
  -H "Authorization: Bearer $TOKEN" \
  -F "logo=@/path/to/logo.png"
```

#### Configure Logo Placement & Styling:
```bash
curl -X POST "http://localhost:3500/api/settings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "brand_logo_position": "bottom-right",
    "brand_logo_opacity": "0.85",
    "brand_logo_scale": "0.15",
    "brand_logo_margin": "30"
  }'
```

---

### 11. WordPress REST API Synchronization

Import media directly from WordPress or export generated assets to your WordPress Media Library.

#### Configure WordPress Credentials:
```bash
curl -X POST "http://localhost:3500/api/settings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "wp_url": "https://your-wordpress-site.com",
    "wp_username": "admin",
    "wp_password": "your_application_password_here"
  }'
```

#### Export Media to WordPress:
```bash
curl -X POST "http://localhost:3500/api/wp/media" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "f784d1e2-b92c-4977-9964-f6b974a9eb48",
    "title": "Featured Luxury Villa",
    "caption": "Rendered via Media Studio"
  }'
```

</details>

---

## 📊 Queue Monitoring & Live Telemetry

Media Studio includes a dedicated BullMQ web monitoring interface powered by **Bull Board**:

- **URL:** [http://localhost:3502](http://localhost:3502)
- **Queues Inspected:**
  - `image-processing` (AI generation, batch operations, Libvips transformations)
  - `video-processing` (FFmpeg encoding, Faster-Whisper transcription, frame sampling)
- **Features:**
  - Real-time job state transitions (`waiting`, `active`, `completed`, `failed`, `delayed`).
  - Stack traces for failed jobs.
  - Manual retry and bulk cleanup actions.

---

## 🔧 Operations, Maintenance & Troubleshooting

<details>
<summary><b>Click to expand Operations, Backup & Troubleshooting Guide</b></summary>
<br>

### Viewing Service Logs
```bash
# View all combined logs
docker compose logs -f

# View logs for a specific service
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f frontend
docker compose logs -f imaginary
```

### Restarting & Rebuilding Services
```bash
# Graceful restart of all containers
docker compose restart

# Complete rebuild (no-cache)
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Database & Storage Backup
All persistent state resides in the `./storage` and `./redis-data` directories:
```bash
# Create a backup of the SQLite database
sqlite3 ./storage/media_studio.sqlite ".backup './storage/media_studio_backup.sqlite'"

# Backup entire storage folder
tar -czvf media_studio_storage_backup.tar.gz ./storage
```

### Common Troubleshooting

#### 1. Redis Connection Errors
- Verify Redis is running: `docker compose ps redis`.
- Test Redis ping: `docker compose exec redis redis-cli ping`.

#### 2. Worker Concurrency & Memory Constraints
- If Faster-Whisper or FFmpeg triggers out-of-memory errors on smaller VPS instances, reduce worker concurrency in `.env`:
  ```bash
  WORKER_CONCURRENCY=1
  ```
- Recreate the worker: `docker compose up -d worker`.

#### 3. Upload Body Limit (413 Payload Too Large)
- Increase `MAX_FILE_SIZE` in `.env` (e.g. `MAX_FILE_SIZE=1000mb`).
- Recreate the API: `docker compose up -d api`.

</details>

---

## 🤝 Contributing & Extensibility

We welcome community contributions, custom providers, and new media operations!

- **[Contribution Guide](CONTRIBUTING.md):** Complete setup guide, coding conventions, and pull request workflow.
- **[How to Add a New AI Provider](CONTRIBUTING.md#how-to-add-a-new-ai-provider):** Step-by-step walkthrough covering database settings, pricing calculations in `shared/pricing.js`, worker provider modules in `worker/providers/`, dispatcher wiring, and React UI dropdowns.
- **[How to Add a New Processing Operation](CONTRIBUTING.md#how-to-add-a-new-processing-operation):** Comprehensive walkthrough for enqueuing jobs in BullMQ, implementing worker processors in `worker/processor.js`, and exposing endpoints in Fastify.
- **[Issue Templates](.github/ISSUE_TEMPLATE/):**
  - [Bug Report](.github/ISSUE_TEMPLATE/bug_report.yml)
  - [Feature Request](.github/ISSUE_TEMPLATE/feature_request.yml)
  - [New Provider Proposal](.github/ISSUE_TEMPLATE/new_provider.yml)
  - [New Processing Operation Proposal](.github/ISSUE_TEMPLATE/new_operation.yml)

---

## 🛡️ Security Policy & Vulnerability Reporting

The Media Studio team prioritizes application safety, container isolation, and user privacy:

- **Private Reporting Policy:** If you discover a vulnerability, please **do NOT create a public issue**. Follow our [Security Policy](SECURITY.md) to report via [GitHub Private Vulnerability Reporting](https://github.com/mirfanghauri/media-studio/security/advisories) or email `security@maxxefy.com`.
- **Response SLAs:** 48-hour acknowledgement, 5-day triage, and priority security patch delivery within 14–30 days (emergency 72h for Critical vulnerabilities).
- **Dependency Automation:** Automated weekly security audits and Dependabot PRs across all services.
- **Hardening Highlights:**
  - Zero hardcoded credentials or keys in version control.
  - Constant-time password validation (`crypto.timingSafeEqual`) to prevent timing attacks.
  - Redis and Imaginary ports bound exclusively to internal networks.
  - Strict input sanitization and shell parameter escaping on FFmpeg invocations.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

