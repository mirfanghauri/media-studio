# Changelog

All notable changes to **Media Studio** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.3] - 2026-10-13

### 🛡️ Security Hardening & Remediation (Follow-up Audit Fixes)

- **Comprehensive Job Endpoint Authentication (Finding A):**
  - Added `verifyAuth` pre-handler to `GET /jobs/:jobId`, `GET /jobs/:jobId/result`, `GET /jobs/:jobId/transcript`, and `GET /jobs/:jobId/raw` in [`api/routes/jobs.js`](api/routes/jobs.js).
  - Added `verifyDownloadAuth` to `GET /jobs/:jobId/download`, permitting `Authorization` header or validated query tokens for direct browser media downloads and `<video>` player playback.
- **Upload Streaming & Memory Exhaustion Prevention (Finding B):**
  - Refactored `POST /api/images-to-video` in [`api/routes/imagesToVideo.js`](api/routes/imagesToVideo.js) to stream every image and audio file directly to disk via `pipe(writeStream)`.
  - Replaced `part.toBuffer()` in multipart consumption to eliminate Node.js heap memory exhaustion during large batch uploads.
  - Added stream draining (`part.file.resume()`) for files exceeding `MAX_IMAGES` or invalid fields.
  - Hardened upload error handling and aborted request cleanup to prevent orphaned files.
- **SSRF End-to-End & Redirect-Hop Protection:**
  - Added `safeFetch` and `safeDownloadFile` in [`shared/ssrf.js`](shared/ssrf.js) with hop-by-hop destination validation across HTTP redirects (301, 302, 303, 307, 308).
  - Replaced uninspected `curl -L` in [`worker/processor.js`](worker/processor.js) with `safeDownloadFile`.
  - Replaced uninspected `fetch()` in [`api/routes/metadata.js`](api/routes/metadata.js) and `axios.get()` in [`api/routes/wordpress.js`](api/routes/wordpress.js) with `safeFetch()`.
- **JWT Query Parameter Scope Restriction:**
  - Standard REST routes in `verifyAuth` now strictly enforce `Authorization: Bearer <token>` headers, preventing token leakage in server logs, browser history, and referrers.
  - Query parameter tokens are restricted to dedicated media download streams via `verifyDownloadAuth`.
- **Reverse Proxy Trust & CORS Allowlist:**
  - Replaced permissive `trustProxy: true` in [`api/server.js`](api/server.js) with explicit trusted private/loopback CIDRs (`127.0.0.1`, `::1`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
  - Added `https://studio.maxxefy.com` and `https://media.maxxefy.com` to CORS origin allowlist.
- **Automated Security Regression Test Suite:**
  - Added [`tests/security.test.js`](tests/security.test.js) with 10 automated unit & integration tests validating SSRF protection, redirect blocking, and authentication enforcement.
  - Added [`.github/workflows/ci.yml`](.github/workflows/ci.yml) to execute security regression tests automatically on push and pull requests.

---

## [1.0.2] - 2026-10-13

### 🛡️ Security Fixes & Hardening (Remediation of Source-Code Audit Findings)

- **Authentication Enforcement (CWE-306):**
  - Added `verifyAuth` pre-handler to `POST /video/resize` ([`api/routes/videoResize.js`](api/routes/videoResize.js)).
  - Added `verifyAuth` pre-handler to `POST /upload` and `POST /process` ([`api/routes/upload.js`](api/routes/upload.js)).
  - Added `verifyAuth` pre-handler to `POST /images-to-video` ([`api/routes/imagesToVideo.js`](api/routes/imagesToVideo.js)).
  - Added `verifyAuth` pre-handler to all metadata injection, inspection, and stripping endpoints in [`api/routes/metadata.js`](api/routes/metadata.js).
  - Added `verifyAuth` pre-handler to job inspection and retry endpoints in [`api/routes/jobs.js`](api/routes/jobs.js).
- **Hardcoded Secret Elimination (CWE-798):**
  - Completely removed `"supersecretkey"` default fallback in [`api/middleware/auth.js`](api/middleware/auth.js). Application now enforces strict `JWT_SECRET` presence and fails closed if missing or insecure.
  - Enforced strict requirement for `ADMIN_PASSWORD` in [`api/routes/images/auth.js`](api/routes/images/auth.js), rejecting weak default credentials (`"admin123"`).
- **Server-Side Request Forgery (SSRF) Protection (CWE-918):**
  - Created centralized SSRF validation engine in [`shared/ssrf.js`](shared/ssrf.js) with asynchronous DNS resolution.
  - Blocks all loopback (`127.0.0.0/8`, `::1`), private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local / cloud metadata endpoints (`169.254.169.254`), and internal Docker container hostnames (`redis`, `imaginary`, `api`, `worker`).
  - Applied dual-layer SSRF validation in `POST /video/resize` (API gateway) and `processResizeVideo` (Worker engine).
  - Hardened worker `curl` invocations with `--proto =http,https --proto-redir =http,https --max-redirs 5`.
  - Added SSRF validation to `POST /images/metadata/fetch-url` and `GET /wordpress/proxy-image`.
- **Upload Streaming & Memory Exhaustion Prevention (CWE-400):**
  - Refactored `POST /upload` in [`api/routes/upload.js`](api/routes/upload.js) to stream files directly to disk via `part.file.pipe(createWriteStream)`.
  - Eliminated in-memory buffering (`Buffer.concat`) for multi-hundred megabyte video payloads, preventing Node.js V8 heap out-of-memory crashes.
  - Added stream failure cleanup to immediately unlink interrupted or aborted file uploads.
- **Path Traversal & Filesystem Containment (CWE-22):**
  - Enforced canonical path containment in `POST /process` ([`api/routes/upload.js`](api/routes/upload.js)), ensuring all processing paths strictly reside inside `/app/storage/videos/`.
  - Added `fs.realpathSync` validation to block symbolic link directory escapes.
- **CORS Hardening:**
  - Replaced permissive wildcard origin reflection in [`api/server.js`](api/server.js) with an explicit trusted allowlist (`CORS_ORIGIN`).
- **Container Documentation Alignment:**
  - Aligned [`SECURITY.md`](SECURITY.md) to accurately document `node:20-slim` Debian-based minimal runtimes for API and worker native toolchains.

---

## [1.0.1] - 2026-10-13

### Added
- **Contribution Guide ([`CONTRIBUTING.md`](CONTRIBUTING.md)):** Detailed guide for open-source contributors with step-by-step walkthroughs on adding new AI providers and custom processing operations.
- **GitHub Issue Templates ([`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/)):** Standardized YAML templates for bug reports, feature requests, AI provider proposals, and processing operation proposals.
- **Dependency Automation:** Added [`.github/dependabot.yml`](.github/dependabot.yml) and weekly audit workflow [`.github/workflows/dependency-update.yml`](.github/workflows/dependency-update.yml).
- **Security Policy:** Comprehensive revision of [`SECURITY.md`](SECURITY.md) with response SLAs, CVSS ratings, and private reporting channels.
- **Versioned Docker Releases:** Automated [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml) and [`scripts/publish-docker.sh`](scripts/publish-docker.sh) for immutable SemVer container image publishing.

---

## [1.0.0] - 2026-10-07

### Initial Release
- Multi-provider AI image generation & inpainting (OpenAI, Azure, Vertex AI, xAI).
- Libvips / Imaginary zero-AI format conversion and resizing.
- Dynamic image-to-video slideshow generation with audio via FFmpeg.
- Remote video compression and CRF scaling.
- Faster-Whisper CPU audio transcription and YouTube SEO AI metadata generation.
- React 18 / Vite frontend and Bull Board queue monitoring.
