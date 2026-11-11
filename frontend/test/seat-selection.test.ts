import assert from "node:assert/strict";
import test from "node:test";
import type { EventSeat } from "../lib/api/types";
import {
  formatSeatAmount,
  sumSeatPrices,
  toggleSeatSelection,
} from "../lib/seats/selection";

function seat(id: string, price: number): EventSeat {
  return {
    id,
    section: "Floor",
    row: "Floor1",
    seatNumber: Number(id),
    category: "STANDARD",
    price,
    status: "AVAILABLE",
  };
}

test("adds a seat once and removes an already selected seat", () => {
  const firstSeat = seat("1", 10);
  const first = toggleSeatSelection([], firstSeat);
  assert.deepEqual(first.selectedSeats, [firstSeat]);
  assert.equal(first.limitReached, false);

  const duplicate = toggleSeatSelection(first.selectedSeats, firstSeat);
  assert.deepEqual(duplicate.selectedSeats, []);
  assert.equal(duplicate.limitReached, false);
});

test("does not add seats beyond the configured selection limit", () => {
  const selected = [seat("1", 10)];
  const result = toggleSeatSelection(selected, seat("2", 12), 1);
  assert.deepEqual(result.selectedSeats, selected);
  assert.equal(result.limitReached, true);
});

test("sums decimal prices without floating-point addition errors", () => {
  assert.equal(sumSeatPrices([seat("1", 0.1), seat("2", 0.2)]), "0.3");
  assert.equal(sumSeatPrices([seat("1", 1.235), seat("2", 2.01)]), "3.245");
  assert.equal(formatSeatAmount(1200), "1200");
});

test("rejects invalid seat prices before rendering a total", () => {
  assert.throws(() => sumSeatPrices([seat("1", Number.NaN)]), RangeError);
});
