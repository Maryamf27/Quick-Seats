"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/states";
import { bookingsApi } from "@/lib/api/endpoints/bookings";
import { ApiError } from "@/lib/api/errors";
import type { BookingStatusResult } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import {
  clearPendingBookingId,
  readCheckoutSessionId,
  readPendingBookingId,
  savePendingBookingId,
} from "@/lib/checkout/pending";

const POLL_MS = 2000;
const MAX_POLLS = 30; // ~60s; the webhook normally lands in a second or two

type View =
  | { kind: "loading" }
  | { kind: "no-booking" }
  | { kind: "result"; result: BookingStatusResult }
  | { kind: "timeout" }
  | { kind: "error"; message: string };

function isSettled(result: BookingStatusResult): boolean {
  return result.status !== "PENDING" || result.paymentStatus === "PAID";
}

export function BookingStatus() {
  const { accessToken } = useAuth();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const polls = useRef(0);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    polls.current = 0;
    let cancelled = false;
    let timer: number | undefined;
    const sessionId = readCheckoutSessionId();
    let bookingId = readPendingBookingId();

    if (!sessionId && !bookingId) {
      timer = window.setTimeout(() => {
        if (!cancelled) setView({ kind: "no-booking" });
      }, 0);
      return () => {
        cancelled = true;
        if (timer) window.clearTimeout(timer);
      };
    }

    const poll = async (id: string) => {
      try {
        const result = await bookingsApi.status(id, accessToken);
        if (cancelled) return;
        if (isSettled(result)) {
          clearPendingBookingId();
          setView({ kind: "result", result });
          return;
        }
        polls.current += 1;
        if (polls.current >= MAX_POLLS) {
          setView({ kind: "timeout" });
          return;
        }
        timer = window.setTimeout(() => {
          void poll(id);
        }, POLL_MS);
      } catch (error: unknown) {
        if (!cancelled) {
          setView({
            kind: "error",
            message:
              error instanceof ApiError
                ? error.message
                : "Booking status could not be checked.",
          });
        }
      }
    };

    // Confirm payment directly with Stripe first. This works even when the
    // webhook cannot reach the server (common in local development). Prefer
    // session_id from the success URL; fall back to the pending booking id.
    const verify = async () => {
      try {
        const result = sessionId
          ? await bookingsApi.verifyCheckoutSession(sessionId, accessToken)
          : await bookingsApi.verifyPayment(bookingId as string, accessToken);
        if (cancelled) return;
        bookingId = result.bookingId;
        savePendingBookingId(result.bookingId);
        if (isSettled(result)) {
          clearPendingBookingId();
          setView({ kind: "result", result });
          return;
        }
        void poll(result.bookingId);
      } catch {
        if (!cancelled) {
          if (bookingId) {
            void poll(bookingId);
            return;
          }
          setView({
            kind: "error",
            message: "Payment could not be verified. Check My bookings shortly.",
          });
        }
      }
    };
    void verify();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [accessToken, attempt]);

  function checkAgain() {
    setView({ kind: "loading" });
    setAttempt((value) => value + 1);
  }

  if (view.kind === "loading") {
    return <LoadingState label="Confirming your payment with the server…" />;
  }

  let title = "";
  let body = "";
  let tone: "success" | "warning" | "danger" = "warning";

  if (view.kind === "no-booking") {
    title = "Thanks — check your bookings";
    body =
      "We couldn’t tell which booking you just paid for in this tab. Your bookings page shows the latest status.";
  } else if (view.kind === "timeout") {
    title = "Still waiting for confirmation";
    body =
      "Your payment is processing. This can take a moment; check My bookings shortly. If it doesn’t confirm, you’ll be refunded automatically.";
  } else if (view.kind === "error") {
    title = "Couldn’t check status";
    body = view.message;
    tone = "danger";
  } else if (view.result.status === "CONFIRMED" && view.result.paymentStatus === "PAID") {
    title = "You’re going!";
    body = "Payment confirmed and your seats are booked.";
    tone = "success";
  } else if (view.result.requiresRefund) {
    title = "Payment received after your hold expired";
    body =
      view.result.refundStatus === "SUCCEEDED"
        ? "The seats were no longer held for you, so your payment was refunded in full."
        : "The seats were no longer held for you, so your payment is being refunded.";
    tone = "warning";
  } else {
    title = `Booking ${view.result.status.toLowerCase()}`;
    body = "This booking did not complete. No seats were booked.";
    tone = "danger";
  }

  return (
    <section className="page-shell booking-result" role="status">
      <Badge tone={tone}>
        {tone === "success" ? "Confirmed" : tone === "danger" ? "Not completed" : "Needs attention"}
      </Badge>
      <h1 className="auth-page__title">{title}</h1>
      <p className="auth-page__description">{body}</p>
      <div className="booking-result__actions">
        {view.kind === "timeout" || view.kind === "error" ? (
          <Button type="button" variant="secondary" onClick={checkAgain}>
            Check status again
          </Button>
        ) : null}
        <Button href="/bookings">View my bookings</Button>
        <Button href="/events" variant="secondary">
          Browse events
        </Button>
      </div>
    </section>
  );
}
