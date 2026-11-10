import type { Server, Socket } from "socket.io";
import type { SeatStatus, UserRole } from "../types/domain.js";
import type { SOCKET_EVENTS } from "./socket.events.js";

export interface EventRoomPayload {
  eventId: string;
}

export type EventRoomAcknowledgement =
  | { success: true; eventId: string }
  | { success: false; error: string };

export interface SeatUpdatePayload {
  eventId: string;
  holdId: string | null;
  seats: Array<{
    seatId: string;
    status: SeatStatus;
    lockedUntil: string | null;
  }>;
  occurredAt: string;
}

export interface ClientToServerEvents {
  [SOCKET_EVENTS.EVENT_JOIN]: (
    payload: EventRoomPayload,
    acknowledge: (response: EventRoomAcknowledgement) => void,
  ) => void;
  [SOCKET_EVENTS.EVENT_LEAVE]: (
    payload: EventRoomPayload,
    acknowledge: (response: EventRoomAcknowledgement) => void,
  ) => void;
}

export interface ServerToClientEvents {
  [SOCKET_EVENTS.SEAT_HELD]: (payload: SeatUpdatePayload) => void;
  [SOCKET_EVENTS.SEAT_RELEASED]: (payload: SeatUpdatePayload) => void;
  [SOCKET_EVENTS.SEAT_EXPIRED]: (payload: SeatUpdatePayload) => void;
  [SOCKET_EVENTS.SEAT_BOOKED]: (payload: SeatUpdatePayload) => void;
  [SOCKET_EVENTS.SEAT_MAP_UPDATED]: (payload: SeatUpdatePayload) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  user?: {
    id: string;
    role: UserRole;
  };
}

export type QuickSeatsSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
export type QuickSeatsSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
