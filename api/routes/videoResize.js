"use strict";

const { randomUUID } = require("crypto");
const { videoQueue } = require("../queue");
const { verifyAuth } = require("../middleware/auth");
const { validateSafeRemoteUrl } = require("../../shared/ssrf");

const PRESETS = new Set(["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"]);

function parseOptionalNumber(value, parser = Number) {
	if (value === undefined || value === null || value === "") return undefined;
	const parsed = parser(value);
	if (!Number.isFinite(parsed)) return undefined;
	return parsed;
}

async function videoResizeRoutes(app) {
	app.post("/video/resize", {
		preHandler: [verifyAuth],
		schema: {
			tags: ["video"],
			summary: "Resize / compress a video from URL",
			description: "Queues a background job that fetches a remote video URL and compresses it to MP4 (H.264 + AAC).",
			body: {
				type: "object",
				required: ["videoUrl"],
				properties: {
					videoUrl: { type: "string", description: "Public HTTP/HTTPS URL to the source video" },
					width: { type: "integer", minimum: 144, maximum: 3840, description: "Target width in pixels (keeps aspect ratio if only width provided)" },
					height: { type: "integer", minimum: 144, maximum: 2160, description: "Target height in pixels (keeps aspect ratio if only height provided)" },
					fps: { type: "number", minimum: 1, maximum: 60, description: "Output frame rate" },
					crf: { type: "integer", minimum: 18, maximum: 40, description: "Compression quality (higher = smaller file)" },
					preset: { type: "string", enum: [...PRESETS], description: "x264 encoding preset" },
					videoBitrate: { type: "string", description: "Optional cap (example: 1200k)" },
					audioBitrate: { type: "string", description: "Audio bitrate (example: 96k). Defaults to 128k" },
					outputName: { type: "string", description: "Optional output filename (without path)" },
				},
			},
			response: {
				202: {
					type: "object",
					properties: {
						jobId: { type: "string" },
						message: { type: "string" },
						source: { type: "string" },
						options: { type: "object" },
					},
				},
				400: { type: "object", properties: { error: { type: "string" } } },
			},
		},
	}, async (req, reply) => {
		const {
			videoUrl,
			width,
			height,
			fps,
			crf,
			preset,
			videoBitrate,
			audioBitrate,
			outputName,
		} = req.body || {};

		const ssrfResult = await validateSafeRemoteUrl(videoUrl);
		if (!ssrfResult.valid) {
			return reply.code(400).send({ error: `Invalid or restricted videoUrl: ${ssrfResult.error}` });
		}
		const normalizedUrl = ssrfResult.normalizedUrl;

		const resizeWidth = parseOptionalNumber(width, (v) => parseInt(v, 10));
		const resizeHeight = parseOptionalNumber(height, (v) => parseInt(v, 10));
		const resizeFps = parseOptionalNumber(fps, parseFloat);
		const resizeCrf = parseOptionalNumber(crf, (v) => parseInt(v, 10));

		if (!resizeWidth && !resizeHeight) {
			return reply.code(400).send({ error: "Provide at least one of width or height" });
		}

		if (preset && !PRESETS.has(preset)) {
			return reply.code(400).send({ error: `Invalid preset. Allowed: ${[...PRESETS].join(", ")}` });
		}

		const jobId = randomUUID();
		const options = {
			...(resizeWidth && { width: resizeWidth }),
			...(resizeHeight && { height: resizeHeight }),
			...(resizeFps && { fps: resizeFps }),
			...(resizeCrf && { crf: resizeCrf }),
			...(preset && { preset }),
			...(videoBitrate && { videoBitrate: String(videoBitrate) }),
			...(audioBitrate && { audioBitrate: String(audioBitrate) }),
			...(outputName && { outputName: String(outputName) }),
		};

		const job = await videoQueue.add(
			"resize-video",
			{
				jobId,
				source: {
					type: "url",
					value: normalizedUrl,
				},
				options,
			},
			{ jobId }
		);

		return reply.code(202).send({
			jobId: job.id,
			message: "Video resize job queued",
			source: normalizedUrl,
			options,
		});
	});
}

module.exports = videoResizeRoutes;
