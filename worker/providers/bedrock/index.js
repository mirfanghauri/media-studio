"use strict";

const { bedrockGenerateMetadata } = require("./metadata");
const { signV4 } = require("./auth");

module.exports = {
  bedrockGenerateMetadata,
  signV4,
};
