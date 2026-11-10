import { SOCKET_EVENTS, type SeatServerEventName } from "../sockets/socket.events.js";
import type {
  QuickSeatsSocketServer,
  SeatUpdatePayload,
} from "../sockets/socket.types.js";
import { eventRoomName } from "../sockets/socket.rooms.js";

let socketServer: QuickSeatsSocketServer | undefined;

export function setSocketServer(server: QuickSeatsSocketServer | undefined): void {
  socketServer = server;
}

export function notifySeatUpdate(
  eventName: SeatServerEventName,
  payload: SeatUpdatePayload,
): void {
  if (!socketServer) {
    return;
  }

  socketServer.to(eventRoomName(payload.eventId)).emit(eventName, payload);
}

export function notifySeatsHeld(input: {
  eventId: string;
  holdId: string;
  seatIds: string[];
  expiresAt: string;
}): void {
  notifySeatUpdate(SOCKET_EVENTS.SEAT_HELD, {
    eventId: input.eventId,
    holdId: input.holdId,
    seats: input.seatIds.map((seatId) => ({
      seatId,
      status: "HELD",
      lockedUntil: input.expiresAt,
    })),
    occurredAt: new Date().toISOString(),
  });
}

export function notifySeatsReleased(input: {
  eventId: string;
  holdId: string;
  seatIds: string[];
  eventName: typeof SOCKET_EVENTS.SEAT_RELEASED | typeof SOCKET_EVENTS.SEAT_EXPIRED;
}): void {
  if (input.seatIds.length === 0) {
    return;
  }

  notifySeatUpdate(input.eventName, {
    eventId: input.eventId,
    holdId: input.holdId,
    seats: input.seatIds.map((seatId) => ({
      seatId,
      status: "AVAILABLE",
      lockedUntil: null,
    })),
    occurredAt: new Date().toISOString(),
  });
}

export function notifySeatsBooked(input: {
  eventId: string;
  holdId: string;
  seatIds: string[];
}): void {
  notifySeatUpdate(SOCKET_EVENTS.SEAT_BOOKED, {
    eventId: input.eventId,
    holdId: input.holdId,
    seats: input.seatIds.map((seatId) => ({
      seatId,
      status: "BOOKED",
      lockedUntil: null,
    })),
    occurredAt: new Date().toISOString(),
  });
}
