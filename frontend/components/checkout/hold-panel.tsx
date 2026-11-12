"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { EventSeat, SeatHoldResult } from "@/lib/api/types";
import { formatSeatAmount, sumSeatPrices } from "@/lib/seats/selection";

interface HoldPanelProps {
  hold: SeatHoldResult;
  seats: EventSeat[];
  paying: boolean;
  releasing: boolean;
  message: string;
  onPay: () => void;
  onRelease: () => void;
  onExpired: () => void;
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function HoldPanel({
  hold,
  seats,
  paying,
  releasing,
  message,
  onPay,
  onRelease,
  onExpired,
}: HoldPanelProps) {
  const expiresAt = new Date(hold.expiresAt).getTime();
  const [remaining, setRemaining] = useState(() => expiresAt - Date.now());

  useEffect(() => {
    const tick = () => {
      const next = expiresAt - Date.now();
      setRemaining(next);
      if (next <= 0) {
        onExpired();
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, onExpired]);

  const urgent = remaining < 60_000;

  return (
    <aside className="seat-selection-summary hold-panel" aria-labelledby="hold-panel-title">
      <span className="eyebrow">Seats reserved for you</span>
      <h2 id="hold-panel-title">Complete your booking</h2>
      <p
        className={`hold-panel__timer${urgent ? " hold-panel__timer--urgent" : ""}`}
        role="timer"
        aria-live="off"
      >
        <span>Hold expires in</span>
        <strong>{formatRemaining(remaining)}</strong>
      </p>
      <ul className="seat-selection-list">
        {seats.map((seat) => (
          <li key={seat.id}>
            <div>
              <strong>{seat.section}</strong>
              <span>Row {seat.row} · Seat {seat.seatNumber} · {seat.category}</span>
            </div>
            <span className="seat-selection-list__price">{formatSeatAmount(seat.price)}</span>
          </li>
        ))}
      </ul>
      <div className="seat-selection-summary__total">
        <span>Estimated total</span>
        <strong>{sumSeatPrices(seats)}</strong>
      </div>
      <p className="seat-selection-summary__disclaimer">
        You&apos;ll pay on Stripe&apos;s secure page (test mode: card 4242 4242 4242 4242). The
        server confirms your payment before the seats become yours.
      </p>
      <Button
        type="button"
        size="large"
        loading={paying}
        disabled={paying || releasing || remaining <= 0}
        onClick={onPay}
      >
        Pay with Stripe
      </Button>
      <Button
        type="button"
        variant="secondary"
        loading={releasing}
        disabled={paying || releasing}
        onClick={onRelease}
      >
        Release seats
      </Button>
      {message ? (
        <p className="seat-selection-summary__message" role="status">
          {message}
        </p>
      ) : null}
    </aside>
  );
}
