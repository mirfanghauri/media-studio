"use strict";

const { vertexGeminiGenerate } = require("./gemini");
const { vertexImagenPredict } = require("./imagen");

/**
 * Route Vertex AI image requests to the correct API based on model type:
 *   - gemini-* models → Gemini generateContent API
 *   - imagen-* / other → Imagen predict API
 *
 * @param {object} job     BullMQ job
 * @param {object} jobData Job data payload
 * @param {'generate'|'edit'} mode
 * @returns {Buffer[]}
 */
async function vertexImagePredict(job, jobData, mode) {
  const model = jobData.model || "gemini-3-pro-image";
  if (model.startsWith("gemini-")) {
    return vertexGeminiGenerate(job, jobData, mode);
  }
  return vertexImagenPredict(job, jobData, mode);
}

const { vertexGenerateMetadata } = require("./metadata");
const { getVertexAccessToken } = require("./auth");

module.exports = {
  vertexImagePredict,
  vertexGenerateMetadata,
  getVertexAccessToken,
};
