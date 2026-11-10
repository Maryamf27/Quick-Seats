export const SOCKET_EVENTS = {
  EVENT_JOIN: "event:join",
  EVENT_LEAVE: "event:leave",
  SEAT_HELD: "seat:held",
  SEAT_RELEASED: "seat:released",
  SEAT_EXPIRED: "seat:expired",
  SEAT_BOOKED: "seat:booked",
  SEAT_MAP_UPDATED: "seat:map:updated",
} as const;

export type SeatServerEventName =
  | typeof SOCKET_EVENTS.SEAT_HELD
  | typeof SOCKET_EVENTS.SEAT_RELEASED
  | typeof SOCKET_EVENTS.SEAT_EXPIRED
  | typeof SOCKET_EVENTS.SEAT_BOOKED
  | typeof SOCKET_EVENTS.SEAT_MAP_UPDATED;
