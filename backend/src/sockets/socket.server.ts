import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../config/env.js";
import { registerEventRoomHandlers } from "./handlers/event-room.handler.js";
import { registerSocketAuthentication } from "./socket.auth.js";
import { setSocketServer } from "../services/seat-notification.service.js";
import { SOCKET_EVENTS } from "./socket.events.js";
import type { QuickSeatsSocketServer } from "./socket.types.js";

export function createSocketServer(httpServer: HttpServer): QuickSeatsSocketServer {
  const io: QuickSeatsSocketServer = new Server(httpServer, {
    cors: {
      origin: env.SOCKET_CORS_ORIGINS,
      credentials: true,
    },
  });

  registerSocketAuthentication(io);
  io.on("connection", (socket) => {
    registerEventRoomHandlers(socket);
    socket.on("disconnect", () => {
      console.info("Socket client disconnected");
    });
  });

  setSocketServer(io);
  return io;
}

export function closeSocketServer(io: QuickSeatsSocketServer): Promise<void> {
  setSocketServer(undefined);

  return new Promise((resolve) => {
    io.close(() => resolve());
  });
}

export { SOCKET_EVENTS };
