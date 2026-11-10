import { createServer, type Server } from "node:http";
import mongoose from "mongoose";
import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { startSeatHoldCleanupScheduler } from "./services/seat-expiration.service.js";
import { startRefundRetryScheduler } from "./services/refund.service.js";
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
  let cleanupTimer: NodeJS.Timeout | undefined;
  let refundTimer: NodeJS.Timeout | undefined;

  try {
    await connectDatabase();
    server = createServer(app);
    io = createSocketServer(server);
    cleanupTimer = startSeatHoldCleanupScheduler();
    refundTimer = startRefundRetryScheduler();
    await listen(server);
    console.info(`QuickSeats API listening on port ${env.PORT}`);
  } catch (error: unknown) {
    const errorType = error instanceof Error ? error.name : "UnknownError";
    console.error(`QuickSeats API failed to start (${errorType})`);
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
    }
    if (refundTimer) {
      clearInterval(refundTimer);
    }
    if (io) {
      try {
        await closeSocketServer(io);
      } catch (closeError: unknown) {
        console.error("Socket.IO cleanup after startup failure failed", closeError);
      }
    } else if (server?.listening) {
      try {
        await closeServer(server);
      } catch (closeError: unknown) {
        console.error("HTTP cleanup after startup failure failed", closeError);
      }
    }
    try {
      await mongoose.disconnect();
    } catch (disconnectError: unknown) {
      console.error("MongoDB cleanup after startup failure failed", disconnectError);
    }
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

    if (cleanupTimer) {
      clearInterval(cleanupTimer);
    }
    if (refundTimer) {
      clearInterval(refundTimer);
    }

    try {
      if (io) {
        await closeSocketServer(io);
      } else {
        await closeServer(server);
      }
      console.info("Socket.IO and HTTP server closed");
    } catch (error: unknown) {
      console.error("Socket.IO and HTTP server shutdown failed", error);
      shutdownFailed = true;
    }

    try {
      await mongoose.disconnect();
      console.info("MongoDB connection closed");
    } catch (error: unknown) {
      console.error("MongoDB shutdown failed", error);
      shutdownFailed = true;
    }

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
