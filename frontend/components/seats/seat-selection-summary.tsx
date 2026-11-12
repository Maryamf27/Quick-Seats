"use client";

import { Button } from "@/components/ui/button";
import type { EventSeat } from "@/lib/api/types";
import { formatSeatAmount, sumSeatPrices } from "@/lib/seats/selection";

interface SeatSelectionSummaryProps {
  selectedSeats: EventSeat[];
  onRemoveSeat: (seatId: string) => void;
  onContinue: () => void;
  continueMessage: string;
  continueLabel?: string;
  continueLoading?: boolean;
}

export function SeatSelectionSummary({
  selectedSeats,
  onRemoveSeat,
  onContinue,
  continueMessage,
  continueLabel = "Continue",
  continueLoading = false,
}: SeatSelectionSummaryProps) {
  return (
    <aside className="seat-selection-summary" aria-labelledby="selection-summary-title">
      <span className="eyebrow">Your selection</span>
      <h2 id="selection-summary-title">Booking summary</h2>
      {selectedSeats.length === 0 ? (
        <p className="seat-selection-summary__empty">
          Choose available seats to see your selection and estimated total.
        </p>
      ) : (
        <>
          <p className="seat-selection-summary__count" aria-live="polite">
            {selectedSeats.length} {selectedSeats.length === 1 ? "seat" : "seats"} selected
          </p>
          <ul className="seat-selection-list">
            {selectedSeats.map((seat) => (
              <li key={seat.id}>
                <div>
                  <strong>{seat.section}</strong>
                  <span>Row {seat.row} · Seat {seat.seatNumber} · {seat.category}</span>
                </div>
                <span className="seat-selection-list__price">{formatSeatAmount(seat.price)}</span>
                <Button
                  type="button"
                  size="small"
                  variant="secondary"
                  aria-label={`Remove ${seat.section}, row ${seat.row}, seat ${seat.seatNumber}`}
                  onClick={() => onRemoveSeat(seat.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <div className="seat-selection-summary__total">
            <span>Estimated total</span>
            <strong>{sumSeatPrices(selectedSeats)}</strong>
          </div>
          <p className="seat-selection-summary__disclaimer">
            Amounts are shown in the seat prices’ units; the API does not provide
            currency or fees. Final availability and price are confirmed by the
            server when you hold the seats.
          </p>
        </>
      )}
      <Button
        type="button"
        size="large"
        loading={continueLoading}
        disabled={selectedSeats.length === 0 || continueLoading}
        onClick={onContinue}
      >
        {continueLabel}
      </Button>
      {continueMessage ? (
        <p className="seat-selection-summary__message" role="status">
          {continueMessage}
        </p>
      ) : null}
    </aside>
  );
}
