"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const { getOpenAIApiKey, getOpenAIBaseUrl, getOpenAIDefaultImageModel } = require("../../utils/settings");
const { validateSize } = require("../../utils/image");
const { sleep } = require("../../utils/retry");
const { STORAGE_PATH } = require("../../utils/storage");

/**
 * OpenAI Direct — Batch API processing (24h window, 50% cost discount).
 *
 * Lifecycle:
 *   1. Build JSONL batch record
 *   2. Upload via Files API
 *   3. Create Batch Job
 *   4. Poll until completed / failed / expired
 *   5. Download output file, parse b64_json
 *
 * @param {object} job     BullMQ job
 * @param {object} jobData Job data payload
 * @returns {Buffer[]}
 */
async function openaiBatchProcess(job, jobData) {
  const { jobId, originalPath, prompt, model, imageSize, quality, operationType } = jobData;
  const apiKey = getOpenAIApiKey();
  const baseUrl = getOpenAIBaseUrl();
  const safeModel = model || getOpenAIDefaultImageModel();
  const safeSize = validateSize(safeModel, imageSize);

  if (!apiKey) {
    throw new Error("OpenAI API key missing. Please set OPENAI_API_KEY in Settings or environment.");
  }

  const headers = { "Authorization": `Bearer ${apiKey}` };

  const isEdit = operationType === "edit" && originalPath && fs.existsSync(originalPath);
  const endpoint = isEdit ? "/v1/images/edits" : "/v1/images/generations";

  job.log(`[OpenAI Batch API] Preparing batch request for endpoint=${endpoint}, model=${safeModel}...`);
  await job.updateProgress(15);

  let requestBody;
  if (isEdit) {
    const imgBuf = fs.readFileSync(originalPath);
    const b64Img = imgBuf.toString("base64");
    const dataUri = `data:image/png;base64,${b64Img}`;
    requestBody = {
      model: safeModel,
      prompt,
      images: [{ image_url: dataUri }],
      size: safeSize,
      quality: quality || "medium",
      output_format: "png",
    };
  } else {
    requestBody = {
      model: safeModel,
      prompt,
      size: safeSize,
      quality: quality || "medium",
      output_format: "png",
    };
  }

  const batchRecord = {
    custom_id: `media-studio-${jobId}`,
    method: "POST",
    url: endpoint,
    body: requestBody,
  };

  const jsonlContent = JSON.stringify(batchRecord) + "\n";
  const tempJsonlPath = path.join(STORAGE_PATH, "images", `batch_in_${jobId}.jsonl`);
  fs.writeFileSync(tempJsonlPath, jsonlContent, "utf8");

  try {
    // ── 1. Upload JSONL ─────────────────────────────────────────────────────
    job.log(`[OpenAI Batch API] Uploading JSONL file to OpenAI Files API...`);
    const form = new FormData();
    form.append("purpose", "batch");
    form.append("file", fs.createReadStream(tempJsonlPath), {
      filename: `batch_in_${jobId}.jsonl`,
      contentType: "application/jsonl",
    });

    const fileUploadRes = await axios.post(`${baseUrl}/files`, form, {
      headers: { ...headers, ...form.getHeaders() },
      timeout: 60000,
    });

    const fileId = fileUploadRes.data.id;
    job.log(`[OpenAI Batch API] Uploaded file ID: ${fileId}`);
    await job.updateProgress(25);

    // ── 2. Create Batch Job ─────────────────────────────────────────────────
    job.log(`[OpenAI Batch API] Creating Batch job on ${endpoint}...`);
    const batchCreateRes = await axios.post(`${baseUrl}/batches`, {
      input_file_id: fileId,
      endpoint,
      completion_window: "24h",
      metadata: { jobId, model: safeModel },
    }, {
      headers: { ...headers, "Content-Type": "application/json" },
      timeout: 30000,
    });

    const batchId = batchCreateRes.data.id;
    job.log(`[OpenAI Batch API] Batch created successfully! ID: ${batchId}`);
    job.data.openaiBatchId = batchId;
    await job.updateProgress(35);

    // ── 3. Poll Batch Status ────────────────────────────────────────────────
    const startTime = Date.now();
    const MAX_WAIT_MS = 30 * 60 * 1000; // 30 minutes max wait
    let batchStatus = "validating";
    let batchData = null;

    while (Date.now() - startTime < MAX_WAIT_MS) {
      await sleep(6000);

      const statusRes = await axios.get(`${baseUrl}/batches/${batchId}`, {
        headers,
        timeout: 15000,
      });

      batchData = statusRes.data;
      batchStatus = batchData.status;
      job.log(`[OpenAI Batch API] Status: ${batchStatus}, completed: ${batchData.request_counts?.completed || 0}/${batchData.request_counts?.total || 1}`);

      if (batchStatus === "validating") {
        await job.updateProgress(40);
      } else if (batchStatus === "in_progress") {
        await job.updateProgress(55);
      } else if (batchStatus === "completed") {
        await job.updateProgress(70);
        break;
      } else if (["failed", "expired", "cancelled"].includes(batchStatus)) {
        let errDetails = "Batch failed";
        if (batchData.error_file_id) {
          try {
            const errRes = await axios.get(`${baseUrl}/files/${batchData.error_file_id}/content`, { headers, timeout: 15000 });
            errDetails = typeof errRes.data === "string" ? errRes.data : JSON.stringify(errRes.data);
          } catch (_) {}
        }
        throw new Error(`OpenAI Batch job ended with status: ${batchStatus}. ${errDetails}`);
      }
    }

    if (batchStatus !== "completed") {
      throw new Error(`OpenAI Batch job timed out waiting for completion (current status: ${batchStatus})`);
    }

    // ── 4. Download and Parse Batch Output ─────────────────────────────────
    const outputFileId = batchData.output_file_id;
    if (!outputFileId) {
      throw new Error("Batch completed without an output_file_id");
    }

    job.log(`[OpenAI Batch API] Downloading output file: ${outputFileId}...`);
    const outputRes = await axios.get(`${baseUrl}/files/${outputFileId}/content`, {
      headers,
      responseType: "text",
      timeout: 60000,
    });

    const outputText = outputRes.data;
    const lines = outputText.trim().split("\n");
    let targetResult = null;

    for (const line of lines) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line);
      if (parsed.custom_id === `media-studio-${jobId}`) {
        targetResult = parsed;
        break;
      }
    }

    if (!targetResult && lines.length > 0) {
      targetResult = JSON.parse(lines[0]);
    }

    if (!targetResult) {
      throw new Error("No valid response object found in batch output file");
    }

    const resBody = targetResult.response?.body;
    if (!resBody) throw new Error("Batch item did not contain response body");
    if (resBody.error) {
      throw new Error(`Batch request failed: ${resBody.error.message || JSON.stringify(resBody.error)}`);
    }

    // Record full usage + batch metadata
    if (resBody.usage) {
      job.data.usageTokens = {
        ...resBody.usage,
        batch_id: batchId,
        cost_discount: "50%",
      };
    }

    const dataItems = resBody.data || [];
    if (!dataItems.length || !dataItems[0].b64_json) {
      throw new Error("Batch result did not return image b64_json data");
    }

    return dataItems.map(item => Buffer.from(item.b64_json, "base64"));

  } finally {
    try {
      if (fs.existsSync(tempJsonlPath)) fs.unlinkSync(tempJsonlPath);
    } catch (_) {}
  }
}

module.exports = { openaiBatchProcess };
