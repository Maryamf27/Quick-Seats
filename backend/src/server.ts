import type { Server } from "node:http";
import mongoose from "mongoose";
import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

function listen(): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(env.PORT);
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

  try {
    await connectDatabase();
    server = await listen();
    console.info(`QuickSeats API listening on port ${env.PORT}`);
  } catch (error: unknown) {
    const errorType = error instanceof Error ? error.name : "UnknownError";
    console.error(`QuickSeats API failed to start (${errorType})`);
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

    try {
      await closeServer(server);
      console.info("HTTP server closed");
    } catch (error: unknown) {
      console.error("HTTP server shutdown failed", error);
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
