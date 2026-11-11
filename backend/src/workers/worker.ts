import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { connectRedis, closeRedis } from "../config/redis.js";
import { closeJobQueues } from "../jobs/queues.js";
import { startBackgroundWorkers } from "../jobs/workers.js";

async function run(): Promise<void> {
  if (!process.env.BULLMQ_REDIS_URL) {
    throw new Error("BULLMQ_REDIS_URL must point to a Redis service compatible with BullMQ");
  }

  let closeWorkers: (() => Promise<void>) | undefined;
  try {
    await connectDatabase();
    await connectRedis();
    closeWorkers = await startBackgroundWorkers();
  } catch (error: unknown) {
    await closeWorkers?.();
    await closeJobQueues();
    await mongoose.disconnect();
    await closeRedis();
    throw error;
  }

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.info(`${signal} received; stopping QuickSeats workers`);
    try {
      await closeWorkers?.();
      await closeJobQueues();
      await mongoose.disconnect();
      await closeRedis();
      console.info("QuickSeats workers stopped");
    } catch (error: unknown) {
      const errorType = error instanceof Error ? error.name : "UnknownError";
      console.error(`QuickSeats worker shutdown failed (${errorType})`);
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

void run().catch((error: unknown) => {
  const errorType = error instanceof Error ? error.name : "UnknownError";
  console.error(`QuickSeats worker failed to start (${errorType})`);
  process.exitCode = 1;
});
