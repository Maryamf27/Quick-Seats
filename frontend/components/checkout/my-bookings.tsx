"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState, LoadingState } from "@/components/ui/states";
import { bookingsApi } from "@/lib/api/endpoints/bookings";
import type { MyBooking } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";

function money(amount: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: (currency ?? "usd").toUpperCase(),
    }).format(amount);
  } catch {
    return String(amount);
  }
}

function paymentFailed(b: MyBooking): boolean {
  return b.status === "PENDING" && b.paymentStatus === "FAILED";
}

function statusLabel(b: MyBooking): string {
  return paymentFailed(b) ? "PAYMENT DECLINED" : b.status;
}

function tone(b: MyBooking): "success" | "warning" | "danger" {
  if (paymentFailed(b)) return "danger";
  if (b.status === "CONFIRMED") return "success";
  if (b.status === "PENDING") return "warning";
  return "danger";
}

export function MyBookings() {
  const { accessToken } = useAuth();
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    bookingsApi
      .mine({ limit: 50 }, accessToken, { signal: controller.signal })
      .then((r) => {
        setError("");
        setBookings(r.bookings);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Your bookings could not be loaded.");
      });
    return () => controller.abort();
  }, [accessToken, attempt]);

  if (error) {
    return <ErrorState title="Couldn’t load bookings" description={error} onRetry={() => setAttempt((n) => n + 1)} />;
  }
  if (!bookings) {
    return <LoadingState label="Loading your bookings…" />;
  }
  if (bookings.length === 0) {
    return (
      <EmptyState
        title="No bookings yet"
        description="Pick an event and hold some seats to get started."
        action={<Button href="/events">Browse events</Button>}
      />
    );
  }

  return (
    <section className="page-shell my-bookings">
      <span className="eyebrow">Your tickets</span>
      <h1 className="auth-page__title">My bookings</h1>
      <ul className="my-bookings__list">
        {bookings.map((b) => (
          <li key={b.id} className="my-bookings__item">
            <div className="my-bookings__head">
              <h2>{b.event?.title ?? "Event"}</h2>
              <Badge tone={tone(b)}>{statusLabel(b)}</Badge>
            </div>
            <p className="my-bookings__meta">
              {b.event ? new Date(b.event.startDate).toLocaleString() : ""}
            </p>
            <p className="my-bookings__meta">
              {b.seats.length} {b.seats.length === 1 ? "seat" : "seats"}:{" "}
              {b.seats.map((s) => `${s.section} ${s.row}${s.seatNumber}`).join(", ")}
            </p>
            <p className="my-bookings__meta">
              {money(b.totalAmount, b.currency)} · payment {b.paymentStatus.toLowerCase()}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
