import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type { EventRoomAcknowledgement, SeatUpdatePayload } from "./contract";

interface ClientToServerEvents {
  "event:join": (
    payload: { eventId: string },
    acknowledge: (response: EventRoomAcknowledgement) => void,
  ) => void;
  "event:leave": (
    payload: { eventId: string },
    acknowledge: (response: EventRoomAcknowledgement) => void,
  ) => void;
}

interface ServerToClientEvents {
  "seat:held": (payload: SeatUpdatePayload) => void;
  "seat:released": (payload: SeatUpdatePayload) => void;
  "seat:expired": (payload: SeatUpdatePayload) => void;
  "seat:booked": (payload: SeatUpdatePayload) => void;
}

export type QuickSeatsSocket = Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;

let sharedSocket: QuickSeatsSocket | null = null;
let configuredToken: string | null = null;

function getSocketUrl(): string {
  const configuredSocketUrl = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
  const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  const candidate = configuredSocketUrl || configuredApiUrl;
  if (!candidate) {
    throw new Error("Live updates are not configured.");
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("The live updates URL is not valid.");
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (configuredSocketUrl && url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("The live updates URL must be an HTTP(S) server origin.");
  }

  const isLoopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (process.env.NODE_ENV === "production" && !isLoopback && url.protocol !== "https:") {
    throw new Error("The production live updates URL must use HTTPS.");
  }

  url.pathname = "/";
  return url.origin;
}

function setSocketAuthentication(
  socket: QuickSeatsSocket,
  accessToken: string | null,
): void {
  socket.auth = accessToken ? { token: accessToken } : {};
}

export function getQuickSeatsSocket(
  accessToken: string | null,
): QuickSeatsSocket {
  if (sharedSocket) {
    if (configuredToken !== accessToken) {
      sharedSocket.disconnect();
      configuredToken = accessToken;
      setSocketAuthentication(sharedSocket, accessToken);
    }
    return sharedSocket;
  }

  const socketUrl = getSocketUrl();
  configuredToken = accessToken;
  sharedSocket = io(socketUrl, {
    autoConnect: false,
    auth: accessToken ? { token: accessToken } : {},
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
  return sharedSocket;
}

export function releaseQuickSeatsSocket(socket: QuickSeatsSocket): void {
  if (socket !== sharedSocket) {
    socket.disconnect();
    return;
  }
  socket.disconnect();
  sharedSocket = null;
  configuredToken = null;
}
