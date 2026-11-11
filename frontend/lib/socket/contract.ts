import type { EventSeat, SeatStatus } from "@/lib/api/types";

export const SOCKET_EVENTS = {
  EVENT_JOIN: "event:join",
  EVENT_LEAVE: "event:leave",
  SEAT_HELD: "seat:held",
  SEAT_RELEASED: "seat:released",
  SEAT_EXPIRED: "seat:expired",
  SEAT_BOOKED: "seat:booked",
} as const;

export type SeatUpdateEventName =
  | typeof SOCKET_EVENTS.SEAT_HELD
  | typeof SOCKET_EVENTS.SEAT_RELEASED
  | typeof SOCKET_EVENTS.SEAT_EXPIRED
  | typeof SOCKET_EVENTS.SEAT_BOOKED;

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

export interface EventRoomAcknowledgement {
  success: boolean;
  eventId?: string;
  error?: string;
}

export function parseSeatUpdatePayload(
  value: unknown,
  expectedEventId: string,
  eventName: SeatUpdateEventName,
): SeatUpdatePayload | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (
    payload.eventId !== expectedEventId ||
    !(payload.holdId === null || typeof payload.holdId === "string") ||
    !Array.isArray(payload.seats) ||
    typeof payload.occurredAt !== "string" ||
    Number.isNaN(Date.parse(payload.occurredAt))
  ) {
    return null;
  }

  const requiredStatus: Partial<Record<SeatUpdateEventName, SeatStatus>> = {
    [SOCKET_EVENTS.SEAT_HELD]: "HELD",
    [SOCKET_EVENTS.SEAT_RELEASED]: "AVAILABLE",
    [SOCKET_EVENTS.SEAT_EXPIRED]: "AVAILABLE",
    [SOCKET_EVENTS.SEAT_BOOKED]: "BOOKED",
  };
  const seats: SeatUpdatePayload["seats"] = [];
  for (const candidate of payload.seats) {
    if (typeof candidate !== "object" || candidate === null) {
      return null;
    }
    const seat = candidate as Record<string, unknown>;
    if (
      typeof seat.seatId !== "string" ||
      !/^[a-f\d]{24}$/i.test(seat.seatId) ||
      (seat.status !== "AVAILABLE" &&
        seat.status !== "HELD" &&
        seat.status !== "BOOKED") ||
      seat.status !== requiredStatus[eventName] ||
      !(seat.lockedUntil === null || typeof seat.lockedUntil === "string") ||
      (typeof seat.lockedUntil === "string" &&
        Number.isNaN(Date.parse(seat.lockedUntil)))
    ) {
      return null;
    }
    seats.push({
      seatId: seat.seatId,
      status: seat.status,
      lockedUntil: seat.lockedUntil,
    });
  }

  return {
    eventId: expectedEventId,
    holdId: payload.holdId,
    seats,
    occurredAt: payload.occurredAt,
  };
}

export function reconcileSeatStatus(
  seats: EventSeat[],
  seatId: string,
  status: SeatStatus,
): { seats: EventSeat[]; changed: boolean } {
  let changed = false;
  const updated = seats.map((seat) => {
    if (seat.id !== seatId || seat.status === status) {
      return seat;
    }
    changed = true;
    return { ...seat, status };
  });
  return { seats: changed ? updated : seats, changed };
}

export function updateSeatSummary<T extends {
  total: number;
  available: number;
  held: number;
  booked: number;
}>(
  summary: T,
  previousStatus: SeatStatus,
  nextStatus: SeatStatus,
): T {
  if (previousStatus === nextStatus) {
    return summary;
  }
  const counts = { ...summary };
  if (previousStatus === "AVAILABLE") counts.available -= 1;
  if (previousStatus === "HELD") counts.held -= 1;
  if (previousStatus === "BOOKED") counts.booked -= 1;
  if (nextStatus === "AVAILABLE") counts.available += 1;
  if (nextStatus === "HELD") counts.held += 1;
  if (nextStatus === "BOOKED") counts.booked += 1;
  return counts;
}

export function getSelectedSeatIdsNowUnavailable(
  selectedSeats: EventSeat[],
  updates: SeatUpdatePayload["seats"],
): string[] {
  const statuses = new Map(updates.map(({ seatId, status }) => [seatId, status]));
  return selectedSeats
    .filter((seat) => {
      const status = statuses.get(seat.id);
      return status !== undefined && status !== "AVAILABLE";
    })
    .map((seat) => seat.id);
}
