"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../../middleware/auth");

/**
 * Constant-time password comparison using SHA-256 digests.
 * Prevents side-channel timing attacks that leak password length/characters.
 */
function timingSafeCheck(inputPassword, expectedPassword) {
  if (typeof inputPassword !== "string" || typeof expectedPassword !== "string") {
    return false;
  }
  const inputHash = crypto.createHash("sha256").update(inputPassword).digest();
  const expectedHash = crypto.createHash("sha256").update(expectedPassword).digest();
  return crypto.timingSafeEqual(inputHash, expectedHash);
}

module.exports = async function (fastify, opts) {
  fastify.post(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
          errorResponseBuilder: (request, context) => ({
            statusCode: 429,
            error: "Too Many Requests",
            message: "Too many failed login attempts. Please wait 1 minute before trying again.",
          }),
        },
      },
    },
    async (request, reply) => {
      const { password } = request.body || {};
      const expectedPassword = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.trim() : "";

      if (!expectedPassword || expectedPassword === "admin123" || expectedPassword === "replace_with_a_strong_password") {
        return reply.code(500).send({
          error: "Server configuration error: ADMIN_PASSWORD must be configured with a secure password in .env."
        });
      }

      if (!password || !timingSafeCheck(password, expectedPassword)) {
        return reply.code(401).send({ error: "Invalid password" });
      }

      const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "72h" });
      return { token };
    }
  );
};
