import assert from "node:assert/strict";
import test from "node:test";
import type { EventSeat } from "../lib/api/types";
import {
  getSelectedSeatIdsNowUnavailable,
  parseSeatUpdatePayload,
  reconcileSeatStatus,
  SOCKET_EVENTS,
} from "../lib/socket/contract";

const eventId = "507f1f77bcf86cd799439011";
const firstSeatId = "507f1f77bcf86cd799439012";
const secondSeatId = "507f1f77bcf86cd799439013";

function seat(id: string, status: EventSeat["status"]): EventSeat {
  return {
    id,
    section: "Floor",
    row: "Floor1",
    seatNumber: 1,
    category: "STANDARD",
    price: 20,
    status,
  };
}

function payload(
  status: EventSeat["status"],
  seatId = firstSeatId,
): Record<string, unknown> {
  return {
    eventId,
    holdId: "hold-id",
    seats: [{ seatId, status, lockedUntil: null }],
    occurredAt: "2026-11-11T10:00:00.000Z",
  };
}

test("validates seat update event payloads and event-specific statuses", () => {
  assert.deepEqual(
    parseSeatUpdatePayload(payload("HELD"), eventId, SOCKET_EVENTS.SEAT_HELD)
      ?.seats[0]?.status,
    "HELD",
  );
  assert.equal(
    parseSeatUpdatePayload(payload("BOOKED"), eventId, SOCKET_EVENTS.SEAT_HELD),
    null,
  );
  assert.equal(
    parseSeatUpdatePayload(payload("HELD"), secondSeatId, SOCKET_EVENTS.SEAT_HELD),
    null,
  );
  assert.equal(
    parseSeatUpdatePayload(
      { ...payload("HELD"), seats: [{ seatId: "bad", status: "HELD", lockedUntil: null }] },
      eventId,
      SOCKET_EVENTS.SEAT_HELD,
    ),
    null,
  );
});

test("updates only the target seat and leaves unrelated records unchanged", () => {
  const seats = [seat(firstSeatId, "AVAILABLE"), seat(secondSeatId, "AVAILABLE")];
  const result = reconcileSeatStatus(seats, firstSeatId, "HELD");
  assert.equal(result.changed, true);
  assert.equal(result.seats[0]?.status, "HELD");
  assert.equal(result.seats[1], seats[1]);

  const duplicate = reconcileSeatStatus(result.seats, firstSeatId, "HELD");
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.seats, result.seats);
});

test("identifies selected seats that have become unavailable", () => {
  const selected = [seat(firstSeatId, "AVAILABLE"), seat(secondSeatId, "AVAILABLE")];
  assert.deepEqual(
    getSelectedSeatIdsNowUnavailable(selected, [
      { seatId: firstSeatId, status: "BOOKED", lockedUntil: null },
    ]),
    [firstSeatId],
  );
  assert.deepEqual(
    getSelectedSeatIdsNowUnavailable(selected, [
      { seatId: firstSeatId, status: "AVAILABLE", lockedUntil: null },
    ]),
    [],
  );
});
