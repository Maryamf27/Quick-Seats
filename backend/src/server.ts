import { createServer, type Server } from "node:http";
import mongoose from "mongoose";
import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { cache, closeRedis, connectRedis } from "./config/redis.js";
import { logRateLimitMetrics } from "./services/rate-limit.service.js";
import { closeJobQueues } from "./jobs/queues.js";
import { subscribeToWorkerSeatUpdates } from "./services/seat-notification.service.js";
import {
  closeSocketServer,
  createSocketServer,
} from "./sockets/socket.server.js";
import type { QuickSeatsSocketServer } from "./sockets/socket.types.js";

function listen(server: Server): Promise<Server> {
  return new Promise((resolve, reject) => {
    const onListening = () => {
      server.off("error", onError);
      resolve(server);
    };
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };

    server.once("listening", onListening);
    server.once("error", onError);
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function startServer(): Promise<void> {
  let server: Server | undefined;
  let io: QuickSeatsSocketServer | undefined;
  let stopSeatNotificationSubscriber: (() => Promise<void>) | undefined;
  let cacheMetricsTimer: NodeJS.Timeout | undefined;

  try {
    await connectDatabase();
    await connectRedis();
    server = createServer(app);
    io = createSocketServer(server);
    try {
      stopSeatNotificationSubscriber = await subscribeToWorkerSeatUpdates();
    } catch (error: unknown) {
      const errorType = error instanceof Error ? error.name : "UnknownError";
      console.error(`Worker seat notification subscription failed (${errorType})`);
    }
    cacheMetricsTimer = setInterval(() => {
      cache.logMetrics();
      logRateLimitMetrics();
    }, 60_000);
    cacheMetricsTimer.unref();
    const listening = listen(server);
    server.listen(env.PORT);
    await listening;
    console.info(`QuickSeats API listening on port ${env.PORT}`);
  } catch (error: unknown) {
    const errorType = error instanceof Error ? error.name : "UnknownError";
    console.error(`QuickSeats API failed to start (${errorType})`);
    if (stopSeatNotificationSubscriber) {
      try {
        await stopSeatNotificationSubscriber();
      } catch (error: unknown) {
        const errorType = error instanceof Error ? error.name : "UnknownError";
        console.error(`Socket notification cleanup after startup failure failed (${errorType})`);
      }
    }
    if (cacheMetricsTimer) {
      clearInterval(cacheMetricsTimer);
    }
    if (io) {
      try {
        await closeSocketServer(io);
      } catch (closeError: unknown) {
        const errorType = closeError instanceof Error ? closeError.name : "UnknownError";
        console.error(`Socket.IO cleanup after startup failure failed (${errorType})`);
      }
    } else if (server?.listening) {
      try {
        await closeServer(server);
      } catch (closeError: unknown) {
        const errorType = closeError instanceof Error ? closeError.name : "UnknownError";
        console.error(`HTTP cleanup after startup failure failed (${errorType})`);
      }
    }
    try {
      await mongoose.disconnect();
    } catch (disconnectError: unknown) {
      const errorType = disconnectError instanceof Error ? disconnectError.name : "UnknownError";
      console.error(`MongoDB cleanup after startup failure failed (${errorType})`);
    }
    try {
      await closeJobQueues();
    } catch (queueCloseError: unknown) {
      const errorType = queueCloseError instanceof Error ? queueCloseError.name : "UnknownError";
      console.error(`Background queue cleanup after startup failure failed (${errorType})`);
    }
    await closeRedis();
    process.exitCode = 1;
    return;
  }

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.info(`${signal} received; shutting down QuickSeats API`);

    let shutdownFailed = false;

    if (stopSeatNotificationSubscriber) {
      try {
        await stopSeatNotificationSubscriber();
      } catch (error: unknown) {
        const errorType = error instanceof Error ? error.name : "UnknownError";
        console.error(`Socket notification subscriber shutdown failed (${errorType})`);
        shutdownFailed = true;
      }
    }
    if (cacheMetricsTimer) {
      clearInterval(cacheMetricsTimer);
      cache.logMetrics();
      logRateLimitMetrics();
    }

    try {
      if (io) {
        await closeSocketServer(io);
      } else {
        await closeServer(server);
      }
      console.info("Socket.IO and HTTP server closed");
    } catch (error: unknown) {
      const errorType = error instanceof Error ? error.name : "UnknownError";
      console.error(`Socket.IO and HTTP server shutdown failed (${errorType})`);
      shutdownFailed = true;
    }

    try {
      await mongoose.disconnect();
      console.info("MongoDB connection closed");
    } catch (error: unknown) {
      const errorType = error instanceof Error ? error.name : "UnknownError";
      console.error(`MongoDB shutdown failed (${errorType})`);
      shutdownFailed = true;
    }

    try {
      await closeJobQueues();
    } catch (error: unknown) {
      const errorType = error instanceof Error ? error.name : "UnknownError";
      console.error(`Background queue shutdown failed (${errorType})`);
      shutdownFailed = true;
    }
    await closeRedis();
    process.exitCode = shutdownFailed ? 1 : 0;
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void startServer();
