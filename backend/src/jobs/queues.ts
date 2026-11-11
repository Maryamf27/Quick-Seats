import { Queue, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env.js";

export const MAINTENANCE_QUEUE = "quickseats-maintenance";
export const ORGANIZER_REPORT_QUEUE = "quickseats-organizer-reports";

let connection: Redis | undefined;
let maintenanceQueue: Queue | undefined;
let reportQueue: Queue | undefined;

function getConnection(): Redis {
  if (!env.BULLMQ_REDIS_URL) {
    throw new Error("BULLMQ_REDIS_URL is required for background jobs");
  }
  connection ??= new Redis(env.BULLMQ_REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });
  return connection;
}

const defaultJobOptions: JobsOptions = {
  attempts: env.BACKGROUND_JOB_ATTEMPTS,
  backoff: { type: "exponential", delay: env.BACKGROUND_JOB_BACKOFF_MS },
  removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 },
};

export function getMaintenanceQueue(): Queue {
  maintenanceQueue ??= new Queue(MAINTENANCE_QUEUE, {
    connection: getConnection(),
    defaultJobOptions,
  });
  return maintenanceQueue;
}

export function getOrganizerReportQueue(): Queue {
  reportQueue ??= new Queue(ORGANIZER_REPORT_QUEUE, {
    connection: getConnection(),
    defaultJobOptions,
  });
  return reportQueue;
}

export async function closeJobQueues(): Promise<void> {
  const queues = [maintenanceQueue, reportQueue].filter(
    (queue): queue is Queue => queue !== undefined,
  );
  await Promise.all(queues.map((queue) => queue.close()));
  maintenanceQueue = undefined;
  reportQueue = undefined;
  if (connection) {
    await connection.quit();
    connection = undefined;
  }
}
