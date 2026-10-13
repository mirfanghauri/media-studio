# Security Policy

The Media Studio maintainers take the security of our application, infrastructure, dependencies, and user data seriously. We are committed to addressing security vulnerabilities rapidly and transparently.

---

## 🛡️ Supported Versions

Only official release versions and the `main` branch receive active security updates. When a vulnerability is resolved, a patch release (e.g., `v1.0.1`) is published with versioned Docker images.

| Version Tag | Supported | Security Notes |
| :--- | :---: | :--- |
| `1.0.x` / `1.x` | :white_check_mark: | Current active release line. Receives security patches. |
| `latest` | :white_check_mark: | Tracks latest stable release on `main`. |
| `< 1.0` | :x: | Pre-release versions. No longer supported; please upgrade. |

---

## 🚨 Vulnerability Reporting Process

If you discover or suspect a security vulnerability in Media Studio, please report it **responsibly and privately**. 

> **Important:** Do NOT create public GitHub issues, discussions, or pull requests for security vulnerabilities.

### Step 1: Submit Private Report

You can submit your vulnerability report through either of the following private channels:

1. **GitHub Private Vulnerability Reporting (Preferred):**
   - Navigate to the repository's [Security Advisories page](https://github.com/mirfanghauri/media-studio/security/advisories).
   - Click **"Report a vulnerability"** to open a confidential report draft directly with the maintainers.
2. **Direct Maintainer Contact:**
   - If GitHub Private Reporting is unavailable, email `security@testpk.dev` or the repository maintainer directly with the subject:
     `[SECURITY REPORT] Media Studio - Vulnerability in <Component>`

### Step 2: What to Include in Your Report

To help us investigate and patch the issue as quickly as possible, please provide:

- **Component / Service Affected:** `api`, `worker`, `frontend`, `queue-monitor`, `imaginary`, `redis`, or `docker-compose`.
- **Vulnerability Category:** (e.g., Remote Code Execution, Authentication Bypass, Server-Side Request Forgery, Path Traversal, Privilege Escalation).
- **Impact Assessment:** Describe what an attacker could achieve if this vulnerability were exploited in production.
- **Step-by-Step Reproduction:**
  - Clear, reproducible steps or scripts.
  - Minimal Proof-of-Concept (PoC) cURL command, HTTP request payload, or test script.
- **Affected Version / Commit SHA:** The exact version tag or commit hash tested (e.g. `v1.0.0`).
- **Suggested Remediation (Optional):** Proposed code diffs, configuration adjustments, or library version bumps.

---

## ⏱️ Response Timeline & SLAs

We adhere to the following response timeline for all reported vulnerabilities:

| Stage | Target SLA | Description |
| :--- | :--- | :--- |
| **Initial Acknowledgement** | Within **48 hours** | We acknowledge receipt of your report and assign a primary maintainer to investigate. |
| **Triage & Validation** | Within **5 business days** | We replicate the issue, determine its severity rating, and confirm exploitability. |
| **Remediation & Patch** | Within **14–30 calendar days** | We develop, test, and release a fix. Critical zero-day issues are prioritized for emergency patch release within 72 hours. |
| **Coordinated Disclosure** | Upon patch publication | A GitHub Security Advisory and CVE (if applicable) are published with credit given to the reporter. |

---

## 📊 Vulnerability Severity Classification

Reports are assessed using the Common Vulnerability Scoring System (CVSS v3.1):

- **Critical (CVSS 9.0 – 10.0):** Remote code execution (RCE) without authentication, unauthenticated arbitrary file read/write, credential exposure of master admin secrets.
- **High (CVSS 7.0 – 8.9):** Authenticated command injection in media workers, SSRF accessing cloud metadata endpoints, authorization bypass between tenants.
- **Medium (CVSS 4.0 – 6.9):** Denial-of-service via malformed media input, CSRF on non-critical actions, information disclosure of non-sensitive paths.
- **Low (CVSS 0.1 – 3.9):** Minor error disclosure, theoretical issues without demonstrable exploit vectors.

---

## 🤝 Safe Harbor & Responsible Disclosure

We consider security research conducted in good faith to be an invaluable contribution. If you make a reasonable effort to follow these guidelines:

- We will **not** pursue legal action or initiate complaints against you.
- We will work with you to understand and resolve the issue quickly.
- We will publicly acknowledge and credit your contribution in the security release notes (unless you prefer anonymity).

**Please do not:**
- Access or modify user data that does not belong to your test accounts.
- Perform volumetric Denial of Service (DoS/DDoS) attacks against live services.
- Exfiltrate data beyond what is strictly necessary to demonstrate proof of concept.

---

## 📦 Dependency Update & Vulnerability Lifecycle

Media Studio actively monitors upstream supply chain security:

1. **Automated Dependabot Scans:** Enabled across all Node.js projects (`api`, `worker`, `dashboard`, `frontend`) and Docker base images, scanning weekly for vulnerable packages.
2. **Scheduled Audit CI:** A weekly GitHub Actions workflow runs `npm audit --audit-level=high` to flag new CVEs.
3. **Container Base Image Hardening:** Base Docker images (`node:20-alpine`, `nginx:alpine`, `redis:7-alpine`) are regularly rebuilt and updated to pull in OS-level security patches.

---

## 🔒 Production Deployment Security Checklist

Before exposing Media Studio to production traffic:

1. **Generate Strong Secrets:**
   - Set a high-entropy random string for `JWT_SECRET` (minimum 32 characters, e.g. `openssl rand -hex 32`).
   - Use a strong, non-default `ADMIN_PASSWORD`.
2. **Network Isolation:**
   - **Never expose Redis (`6379`) or Imaginary (`9000`) to the public internet.** In `docker-compose.yml`, they are bound to `127.0.0.1` or internal Docker networks.
3. **TLS & Reverse Proxy:**
   - Place all web-facing ports (`API_PORT: 3500`, `FRONTEND_PORT: 3501`, `QUEUE_MONITOR_PORT: 3502`) behind a reverse proxy (e.g. Nginx, Caddy, Cloudflare) with HTTPS enabled and HSTS headers.
4. **Least-Privilege Cloud Credentials:**
   - Restrict Google Cloud Service Account keys (`vertex-sa-key.json`) to minimal IAM roles (e.g., `Vertex AI User`).
   - Restrict AWS Bedrock credentials to scoped IAM policies targeting only the required foundation models.
5. **Disk Quotas & Storage Monitoring:**
   - Ensure `./storage` has sufficient disk quotas and automated cleanup policies to prevent disk exhaustion from large video encodes.
