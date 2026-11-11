import type { RequestHandler } from "express";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { getRedisReadiness } from "../config/redis.js";
import { sendSuccess } from "../utils/api-response.js";

export interface ReadinessSnapshot {
  status: "ready" | "not_ready";
  database: "connected" | "disconnected";
  cacheRedis: "connected" | "disconnected" | "not_configured";
  workerRedis: "connected" | "disconnected" | "not_configured";
}

export function assessReadiness(
  databaseReady: boolean,
  redis: ReturnType<typeof getRedisReadiness>,
): ReadinessSnapshot {
  const ready =
    databaseReady &&
    Boolean(env.REDIS_URL) &&
    redis.cache === "connected" &&
    (!env.BULLMQ_REDIS_URL || redis.notifications === "connected");

  return {
    status: ready ? "ready" : "not_ready",
    database: databaseReady ? "connected" : "disconnected",
    cacheRedis: redis.cache,
    workerRedis: redis.notifications,
  };
}

export const getHealth: RequestHandler = (_request, response) => {
  return sendSuccess(
    response,
    { status: "alive" },
    "QuickSeats API is running",
  );
};

export const getReadiness: RequestHandler = (_request, response) => {
  const readiness = assessReadiness(
    mongoose.connection.readyState === 1,
    getRedisReadiness(),
  );
  if (readiness.status !== "ready") {
    return response.status(503).json({
      success: false,
      message: "Application is not ready",
      data: readiness,
    });
  }
  return sendSuccess(response, readiness, "QuickSeats API is ready");
};
