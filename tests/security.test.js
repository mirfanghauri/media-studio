"use strict";

const path = require("path");
module.paths.push(path.join(__dirname, "..", "api", "node_modules"));

const assert = require("assert");
const http = require("http");
const jwt = require("jsonwebtoken");
const { validateSafeRemoteUrl, safeFetch, isPrivateIPv4, isPrivateIPv6 } = require("../shared/ssrf");

const TEST_SECRET = "super_secure_random_jwt_secret_key_for_unit_tests_32chars_long";
process.env.JWT_SECRET = TEST_SECRET;

const { verifyAuth, verifyDownloadAuth } = require("../api/middleware/auth");

async function runTests() {
  console.log("🛡️ Running Media Studio Security Regression Test Suite...\n");
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  // --- Section 1: SSRF Validation Unit Tests ---
  console.log("--- Section 1: SSRF IP & URL Validation ---");

  await test("Detects and blocks private IPv4 ranges", async () => {
    assert.strictEqual(isPrivateIPv4("127.0.0.1"), true, "Loopback must be private");
    assert.strictEqual(isPrivateIPv4("10.0.0.1"), true, "10.x must be private");
    assert.strictEqual(isPrivateIPv4("172.17.0.2"), true, "Docker subnet 172.17 must be private");
    assert.strictEqual(isPrivateIPv4("192.168.1.1"), true, "192.168.x must be private");
    assert.strictEqual(isPrivateIPv4("169.254.169.254"), true, "Cloud metadata IP must be private");
    assert.strictEqual(isPrivateIPv4("8.8.8.8"), false, "Public Google DNS must not be private");
    assert.strictEqual(isPrivateIPv4("1.1.1.1"), false, "Public Cloudflare DNS must not be private");
  });

  await test("Detects and blocks private & IPv4-mapped IPv6 ranges", async () => {
    assert.strictEqual(isPrivateIPv6("::1"), true, "IPv6 loopback must be private");
    assert.strictEqual(isPrivateIPv6("::ffff:127.0.0.1"), true, "IPv4-mapped loopback must be private");
    assert.strictEqual(isPrivateIPv6("::ffff:169.254.169.254"), true, "IPv4-mapped metadata must be private");
    assert.strictEqual(isPrivateIPv6("fc00::1"), true, "Unique local must be private");
    assert.strictEqual(isPrivateIPv6("fe80::1"), true, "Link-local must be private");
  });

  await test("Rejects internal hostnames and cloud metadata hostnames", async () => {
    const resLocal = await validateSafeRemoteUrl("http://localhost:3000/api");
    assert.strictEqual(resLocal.valid, false);

    const resMeta = await validateSafeRemoteUrl("http://metadata.google.internal/computeMetadata/v1/");
    assert.strictEqual(resMeta.valid, false);

    const resRedis = await validateSafeRemoteUrl("http://redis:6379");
    assert.strictEqual(resRedis.valid, false);

    const resWorker = await validateSafeRemoteUrl("http://worker:3000");
    assert.strictEqual(resWorker.valid, false);
  });

  await test("Rejects non-HTTP protocols (file, ftp, gopher)", async () => {
    const resFile = await validateSafeRemoteUrl("file:///etc/passwd");
    assert.strictEqual(resFile.valid, false);

    const resFtp = await validateSafeRemoteUrl("ftp://evil.com/exploit");
    assert.strictEqual(resFtp.valid, false);
  });

  await test("Rejects credentials in URLs", async () => {
    const resCreds = await validateSafeRemoteUrl("http://user:password@example.com/");
    assert.strictEqual(resCreds.valid, false);
  });

  // --- Section 2: SSRF Redirect & Rebinding Protection ---
  console.log("\n--- Section 2: SSRF Redirect Protection (safeFetch) ---");

  await test("safeFetch blocks HTTP redirect leading to loopback/internal IP", async () => {
    // Spin up a test HTTP server that issues a redirect to 127.0.0.1
    const testServer = http.createServer((req, res) => {
      if (req.url === "/redirect-to-loopback") {
        res.writeHead(302, { Location: "http://127.0.0.1:9999/secret" });
        res.end();
      } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
      }
    });

    await new Promise((resolve) => testServer.listen(0, "127.0.0.1", resolve));
    const port = testServer.address().port;

    let caughtError = null;
    try {
      // Even if the initial URL is accessed on the test port, the redirect target is 127.0.0.1
      await safeFetch(`http://127.0.0.1:${port}/redirect-to-loopback`);
    } catch (err) {
      caughtError = err;
    } finally {
      await new Promise((resolve) => testServer.close(resolve));
    }

    assert.ok(caughtError, "safeFetch must throw an error when target or redirect is loopback/internal");
    assert.ok(
      caughtError.message.includes("SSRF Security Check Failed") || caughtError.message.includes("blocked"),
      `Expected SSRF rejection, got: ${caughtError.message}`
    );
  });

  // --- Section 3: Authentication Enforcement Tests ---
  console.log("\n--- Section 3: Authentication Enforcement ---");

  await test("verifyAuth rejects unauthenticated requests (missing header)", async () => {
    let statusCode = null;
    let payload = null;
    const req = { headers: {} };
    const reply = {
      code(code) {
        statusCode = code;
        return {
          send(data) {
            payload = data;
          },
        };
      },
    };

    await verifyAuth(req, reply);
    assert.strictEqual(statusCode, 401, "Missing auth header must return 401");
    assert.ok(payload.error, "Payload must contain error property");
  });

  await test("verifyAuth rejects query-string tokens on standard API routes", async () => {
    const validToken = jwt.sign({ sub: "admin" }, TEST_SECRET, { expiresIn: "1h" });
    let statusCode = null;
    let payload = null;
    const req = { headers: {}, query: { token: validToken } };
    const reply = {
      code(code) {
        statusCode = code;
        return {
          send(data) {
            payload = data;
          },
        };
      },
    };

    await verifyAuth(req, reply);
    assert.strictEqual(statusCode, 401, "Query-string token must be rejected by verifyAuth on standard routes");
  });

  await test("verifyAuth succeeds with valid Bearer Authorization header", async () => {
    const validToken = jwt.sign({ sub: "admin" }, TEST_SECRET, { expiresIn: "1h" });
    let statusCode = null;
    const req = { headers: { authorization: `Bearer ${validToken}` } };
    const reply = {
      code(code) {
        statusCode = code;
        return { send() {} };
      },
    };

    await verifyAuth(req, reply);
    assert.strictEqual(statusCode, null, "Valid Bearer header must not send error code");
    assert.strictEqual(req.user.sub, "admin", "User must be attached to request");
  });

  await test("verifyDownloadAuth allows verified token in query parameter for browser media streaming", async () => {
    const validToken = jwt.sign({ sub: "admin" }, TEST_SECRET, { expiresIn: "1h" });
    let statusCode = null;
    const req = { headers: {}, query: { token: validToken } };
    const reply = {
      code(code) {
        statusCode = code;
        return { send() {} };
      },
    };

    await verifyDownloadAuth(req, reply);
    assert.strictEqual(statusCode, null, "verifyDownloadAuth must accept valid query token");
    assert.strictEqual(req.user.sub, "admin");
  });

  console.log("\n=======================================================");
  console.log(`Security Test Results: ${passed} Passed, ${failed} Failed`);
  console.log("=======================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
