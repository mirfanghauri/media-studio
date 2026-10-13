"use strict";

const dns = require("dns").promises;
const net = require("net");

/**
 * Checks if an IPv4 address belongs to a private, loopback, or reserved range.
 */
function isPrivateIPv4(ip) {
  const parts = ip.split(".").map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IP, block
  }

  const [a, b, c, d] = parts;

  // 0.0.0.0/8 (Broadcast/Current network)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private)
  if (a === 10) return true;

  // 100.64.0.0/10 (Carrier-Grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-Local / AWS/GCP Metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private - default Docker networks 172.17.x, 172.18.x, etc.)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && c === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && c === 2) return true;

  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Network benchmark testing)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 (Multicast)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved)
  if (a >= 240) return true;

  // 255.255.255.255 (Broadcast)
  if (a === 255 && b === 255 && c === 255 && d === 255) return true;

  return false;
}

/**
 * Checks if an IPv6 address is private, loopback, or link-local.
 */
function isPrivateIPv6(ip) {
  const normalized = ip.toLowerCase();

  // IPv6 loopback
  if (normalized === "::1" || normalized === "0000:0000:0000:0000:0000:0000:0000:0001") return true;
  // Unspecified
  if (normalized === "::" || normalized === "0000:0000:0000:0000:0000:0000:0000:0000") return true;

  // IPv4-mapped IPv6 (::ffff:192.0.2.1)
  if (normalized.startsWith("::ffff:") || normalized.startsWith("0000:0000:0000:0000:0000:ffff:")) {
    const ipv4Part = ip.split(":").pop();
    if (net.isIPv4(ipv4Part)) {
      return isPrivateIPv4(ipv4Part);
    }
  }

  // Unique local addresses (fc00::/7 -> fc00... to fdff...)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  // Link-local addresses (fe80::/10 -> fe80... to febf...)
  if (/^fe[89ab]/i.test(normalized)) return true;

  return false;
}

/**
 * Validates a remote URL against Server-Side Request Forgery (SSRF) threats.
 * Resolves all DNS records and rejects any private, loopback, or metadata addresses.
 *
 * @param {string} rawUrl
 * @returns {Promise<{ valid: boolean, error?: string, normalizedUrl?: string }>}
 */
async function validateSafeRemoteUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, error: "Malformed URL" };
  }

  // Only allow HTTP/HTTPS
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: "Only HTTP and HTTPS protocols are permitted" };
  }

  // Block credentials in URL
  if (parsed.username || parsed.password) {
    return { valid: false, error: "URLs containing credentials are not permitted" };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block obvious internal hosts and cloud metadata hostnames
  const BLOCKED_HOSTNAMES = [
    "localhost",
    "metadata.google.internal",
    "metadata.google",
    "instance-data",
    "redis",
    "imaginary",
    "api",
    "worker",
    "frontend",
    "queue-monitor",
  ];

  if (
    BLOCKED_HOSTNAMES.includes(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return { valid: false, error: "Target host is an internal or reserved domain" };
  }

  // If hostname is directly an IP literal
  if (net.isIP(hostname)) {
    if (net.isIPv4(hostname) && isPrivateIPv4(hostname)) {
      return { valid: false, error: "Direct access to private or reserved IPv4 addresses is blocked" };
    }
    if (net.isIPv6(hostname) && isPrivateIPv6(hostname)) {
      return { valid: false, error: "Direct access to private or reserved IPv6 addresses is blocked" };
    }
  }

  // Resolve hostname via DNS to inspect all destination IPs
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      return { valid: false, error: "Unable to resolve target host" };
    }

    for (const record of addresses) {
      if (record.family === 4 && isPrivateIPv4(record.address)) {
        return { valid: false, error: `Host resolves to restricted IPv4 destination (${record.address})` };
      }
      if (record.family === 6 && isPrivateIPv6(record.address)) {
        return { valid: false, error: `Host resolves to restricted IPv6 destination (${record.address})` };
      }
    }
  } catch (dnsErr) {
    return { valid: false, error: `DNS resolution failed: ${dnsErr.message}` };
  }

  return { valid: true, normalizedUrl: parsed.toString() };
}

module.exports = {
  validateSafeRemoteUrl,
  isPrivateIPv4,
  isPrivateIPv6,
};
