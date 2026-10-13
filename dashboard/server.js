"use strict";

const express = require("express");
const { createBullBoard } = require("@bull-board/api");
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");
const { ExpressAdapter } = require("@bull-board/express");
const { Queue: BullMQ } = require("bullmq");
const Redis = require("ioredis");

const REDIS_HOST = process.env.REDIS_HOST || "redis";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);
const PORT = parseInt(process.env.PORT || "3001", 10);

const connection = new Redis(REDIS_PORT, REDIS_HOST, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Define known queues to display
const queueNames = ["video-processing", "image-processing"];
const queues = queueNames.map(
  (name) => new BullMQAdapter(new BullMQ(name, { connection }))
);

const app = express();

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/");

const { setQueues } = createBullBoard({
  queues,
  serverAdapter,
});

app.use("/", serverAdapter.getRouter());

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Bull Board dashboard running on http://0.0.0.0:${PORT}`);
});
