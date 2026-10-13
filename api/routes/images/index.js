"use strict";

/**
 * Images route plugin — registers all modular sub-route handlers.
 * Replaces the monolithic api/routes/images.js (1293 lines).
 */
module.exports = async function (fastify, opts) {
  fastify.register(require("./auth"));
  fastify.register(require("./logo"));
  fastify.register(require("./settings"));
  fastify.register(require("./queue"));
  fastify.register(require("./status"));
  fastify.register(require("./download"));
  fastify.register(require("./history"));
  // Note: enhance-prompt route removed — to be re-added in a future iteration
};
