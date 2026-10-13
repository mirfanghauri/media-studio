# Security Policy

## Supported Versions

Only the latest release of Media Studio on the `main` branch is actively supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

The Media Studio team takes the security of our application, infrastructure, and user data seriously. If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public GitHub issue.**
2. Send an email to the repository owner or use [GitHub Private Vulnerability Reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-communicating-vulnerabilities/privately-reporting-a-security-vulnerability).
3. Include detailed steps to reproduce the vulnerability, including:
   - Impact assessment
   - Proof of Concept (PoC) scripts or cURL commands
   - Affected service (`api`, `worker`, `dashboard`, `frontend`, or `imaginary`)
   - Any suggested remediations

## Deployment Security Checklist

When deploying Media Studio to production:
- Ensure `.env` is populated with strong values for `JWT_SECRET` (at least 32 random characters) and `ADMIN_PASSWORD`.
- Never expose the Redis port (`6379`) or Imaginary port (`9000`) directly to public internet without internal VPN/firewall protection.
- Bind the web UI and API ports to reverse proxy interfaces (e.g. Nginx, Caddy, Cloudflare) with TLS/HTTPS enabled.
- Keep your Google Cloud Service Account credentials (`vertex-sa-key.json`) restricted to minimal IAM roles (e.g. `Vertex AI User`).

