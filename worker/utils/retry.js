"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMIT CONFIG
// GPT-Image-1 series & GPT-Image-2: 5 images per minute
// ─────────────────────────────────────────────────────────────────────────────
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 15000; // 15s initial delay (12s rate window + buffer)

/**
 * Detect error type from API response.
 * @returns {'rate_limit'|'content_policy'|'other'}
 */
function classifyError(err) {
  const azureStatus = err.response?.status;
  const azureCode = err.response?.data?.error?.code || "";
  const azureMsg = (err.response?.data?.error?.message || err.message || "").toLowerCase();

  if (azureStatus === 429 || azureMsg.includes("rate limit") || azureMsg.includes("quota")) {
    return "rate_limit";
  }
  if (
    azureCode === "contentFilter" ||
    azureCode === "content_filter" ||
    azureCode === "content_policy_violation" ||
    azureMsg.includes("content filter") ||
    azureMsg.includes("content policy") ||
    azureMsg.includes("blocked by") ||
    azureMsg.includes("content_policy_violation")
  ) {
    return "content_policy";
  }

  const vertexStatus = err.response?.status;
  const vertexBody = err.response?.data || {};
  const vertexMsg = (vertexBody.error?.message || err.message || "").toLowerCase();

  if (vertexStatus === 429 || vertexMsg.includes("quota") || vertexMsg.includes("rate") || vertexMsg.includes("resource_exhausted")) {
    return "rate_limit";
  }
  if (
    vertexMsg.includes("safety") ||
    vertexMsg.includes("blocked") ||
    vertexMsg.includes("content filter") ||
    vertexMsg.includes("content_policy") ||
    vertexMsg.includes("harmful")
  ) {
    return "content_policy";
  }

  return "other";
}

/**
 * Sleep for ms milliseconds.
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Call an async API function with exponential backoff on rate limits.
 * @param {Function} apiFn   Async function that makes the API call
 * @param {object}   job     BullMQ job (for logging)
 * @param {string}   label   Human-readable label for logs
 */
async function withRetry(apiFn, job, label) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await apiFn();
    } catch (err) {
      const errorType = classifyError(err);

      if (errorType === "rate_limit") {
        const retryAfterHeader = err.response?.headers?.["retry-after"];
        const retryAfterMs = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : BASE_DELAY_MS * Math.pow(2, attempt - 1);

        const waitSec = Math.round(retryAfterMs / 1000);
        job.log(`[${label}] Rate limit hit (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${waitSec}s…`);
        console.warn(`[RATE_LIMIT] ${label} — attempt ${attempt}, waiting ${waitSec}s`);

        if (attempt < MAX_RETRIES) {
          await sleep(retryAfterMs);
          continue;
        }
        throw new Error(
          `RATE_LIMIT_EXCEEDED: API rate limit reached after ${MAX_RETRIES} retries. ` +
          `Please wait 60 seconds and try again.`
        );
      }

      if (errorType === "content_policy") {
        const rawMsg = err.response?.data?.error?.message || err.message;
        console.error(`[CONTENT_POLICY] ${label} — ${rawMsg}`);
        job.log(`[${label}] Content policy violation detected: ${rawMsg}`);
        throw new Error(
          `CONTENT_POLICY_VIOLATION: Your prompt or the generated output was blocked by the content filter. ` +
          `Please modify your prompt to avoid prohibited content. ` +
          `Original reason: ${rawMsg}`
        );
      }

      throw err;
    }
  }
}

module.exports = { classifyError, sleep, withRetry };
