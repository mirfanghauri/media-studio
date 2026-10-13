"use strict";

const { azureGenerate } = require("./generate");
const { azureEdit } = require("./edit");
const { azureGenerateMetadata } = require("./metadata");

module.exports = {
  azureGenerate,
  azureEdit,
  azureGenerateMetadata,
};
