import type { EventSeat } from "@/lib/api/types";

export const MAX_SEATS_PER_HOLD = 10;

export function toggleSeatSelection(
  selectedSeats: EventSeat[],
  seat: EventSeat,
  limit = MAX_SEATS_PER_HOLD,
): { selectedSeats: EventSeat[]; limitReached: boolean } {
  if (selectedSeats.some((selected) => selected.id === seat.id)) {
    return {
      selectedSeats: selectedSeats.filter((selected) => selected.id !== seat.id),
      limitReached: false,
    };
  }

  if (selectedSeats.length >= limit) {
    return { selectedSeats, limitReached: true };
  }

  return {
    selectedSeats: [...selectedSeats, seat],
    limitReached: false,
  };
}

function decimalParts(value: number): { coefficient: bigint; scale: number } {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("Seat prices must be finite, non-negative numbers.");
  }

  const [mantissa = "0", exponentText] = value.toString().toLowerCase().split("e");
  const exponent = exponentText ? Number(exponentText) : 0;
  const [whole = "0", fraction = ""] = mantissa.split(".");
  let coefficient = BigInt(`${whole}${fraction}`);
  let scale = fraction.length - exponent;

  if (scale < 0) {
    coefficient *= BigInt(10) ** BigInt(-scale);
    scale = 0;
  }

  return { coefficient, scale };
}

function decimalString(coefficient: bigint, scale: number): string {
  if (scale === 0) {
    return coefficient.toString();
  }

  const digits = coefficient.toString().padStart(scale + 1, "0");
  const splitAt = digits.length - scale;
  const whole = digits.slice(0, splitAt);
  const fraction = digits.slice(splitAt).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function formatSeatAmount(value: number): string {
  const { coefficient, scale } = decimalParts(value);
  return decimalString(coefficient, scale);
}

export function sumSeatPrices(seats: EventSeat[]): string {
  const amounts = seats.map((seat) => decimalParts(seat.price));
  const scale = amounts.reduce((maximum, amount) => Math.max(maximum, amount.scale), 0);
  const total = amounts.reduce(
    (sum, amount) =>
      sum + amount.coefficient * BigInt(10) ** BigInt(scale - amount.scale),
    BigInt(0),
  );
  return decimalString(total, scale);
}
