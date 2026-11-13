"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/states";
import { SeatMap } from "@/components/seats/seat-map";
import { SeatSelectionSummary } from "@/components/seats/seat-selection-summary";
import { HoldPanel } from "@/components/checkout/hold-panel";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { eventsApi } from "@/lib/api/events";
import { bookingsApi } from "@/lib/api/endpoints/bookings";
import type {
  EventRecord,
  EventSeat,
  EventVenueSummary,
  SeatHoldResult,
} from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { isSafeCheckoutUrl, savePendingBookingId } from "@/lib/checkout/pending";
import {
  MAX_SEATS_PER_HOLD,
  toggleSeatSelection,
} from "@/lib/seats/selection";

interface EventDetailsProps {
  eventId: string;
}

function getEventError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Event details could not be loaded. Please try again.";
}

function getVenue(venue: EventRecord["venueId"]): EventVenueSummary | null {
  return typeof venue === "object" && venue !== null ? venue : null;
}

function formatEventDate(value: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function getAddress(venue: EventVenueSummary): string {
  return [
    venue.address.street,
    venue.address.city,
    venue.address.state,
    venue.address.postalCode,
    venue.address.country,
  ]
    .filter((part) => part.trim())
    .join(", ");
}

function isSafeImageUrl(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function EventDetailsContent({ event }: { event: EventRecord }) {
  const [imageUnavailable, setImageUnavailable] = useState(
    !isSafeImageUrl(event.posterUrl),
  );
  const [selectedSeats, setSelectedSeats] = useState<EventSeat[]>([]);
  const [selectionMessage, setSelectionMessage] = useState("");
  const [hold, setHold] = useState<SeatHoldResult | null>(null);
  const [heldSeats, setHeldSeats] = useState<EventSeat[]>([]);
  const [holding, setHolding] = useState(false);
  const [paying, setPaying] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [holdMessage, setHoldMessage] = useState("");
  // While we own a hold (or are creating one) the live "seat:held" echo of our
  // own hold must not strip those seats from the selection or show an error.
  const holdActive = useRef(false);
  const { status: authStatus, accessToken, user } = useAuth();
  const { notify } = useToast();
  const router = useRouter();
  const venue = getVenue(event.venueId);
  const startTime = new Date(event.startDate);
  const endTime = new Date(event.endDate);
  const endTimeOptions: Intl.DateTimeFormatOptions =
    Number.isNaN(startTime.getTime()) ||
    Number.isNaN(endTime.getTime()) ||
    startTime.toDateString() === endTime.toDateString()
      ? { hour: "numeric", minute: "2-digit" }
      : {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        };
  const selectedSeatIds = selectedSeats.map((seat) => seat.id);

  function toggleSeat(seat: EventSeat) {
    const result = toggleSeatSelection(selectedSeats, seat);
    setSelectedSeats(result.selectedSeats);
    setSelectionMessage(
      result.limitReached
        ? `You can select up to ${MAX_SEATS_PER_HOLD} seats for this event.`
        : "",
    );
  }

  async function holdSelectedSeats() {
    if (selectedSeatIds.length === 0 || holding) {
      return;
    }
    if (authStatus !== "authenticated" || !accessToken) {
      router.push(`/login?next=${encodeURIComponent(`/events/${event._id}`)}`);
      return;
    }
    const snapshot = selectedSeats;
    holdActive.current = true;
    setHolding(true);
    setSelectionMessage("");
    try {
      const result = await eventsApi.holdSeats(event._id, selectedSeatIds, accessToken);
      setHold(result);
      setHeldSeats(snapshot);
      setSelectedSeats([]);
      setHoldMessage("");
    } catch (error: unknown) {
      holdActive.current = false;
      if (error instanceof ApiError && error.status === 409) {
        setSelectionMessage(
          "One or more of those seats was just taken by someone else. Pick different seats.",
        );
      } else if (error instanceof ApiError && error.status === 429) {
        setSelectionMessage("Too many attempts — wait a few seconds and try again.");
      } else {
        setSelectionMessage(getEventError(error));
      }
    } finally {
      setHolding(false);
    }
  }

  const clearHold = useCallback(() => {
    holdActive.current = false;
    setHold(null);
    setHeldSeats([]);
    setHoldMessage("");
  }, []);

  const handleHoldExpired = useCallback(() => {
    clearHold();
    notify("Your seat hold expired. Pick your seats again.", "warning");
  }, [clearHold, notify]);

  async function releaseHeldSeats() {
    if (!hold || !accessToken) {
      return;
    }
    setReleasing(true);
    try {
      await eventsApi.releaseHold(event._id, hold.holdId, accessToken);
      clearHold();
      notify("Seats released.", "info");
    } catch (error: unknown) {
      setHoldMessage(getEventError(error));
    } finally {
      setReleasing(false);
    }
  }

  async function payForHold() {
    if (!hold || !accessToken) {
      return;
    }
    setPaying(true);
    setHoldMessage("");
    try {
      const checkout = await bookingsApi.checkout(
        { eventId: event._id, holdId: hold.holdId },
        accessToken,
      );
      if (!isSafeCheckoutUrl(checkout.checkoutUrl)) {
        throw new Error("unexpected checkout url");
      }
      savePendingBookingId(checkout.bookingId);
      window.location.assign(checkout.checkoutUrl);
    } catch (error: unknown) {
      setPaying(false);
      setHoldMessage(
        error instanceof ApiError
          ? error.message
          : "Checkout could not be started. Please try again.",
      );
    }
  }

  return (
    <div className="page-shell event-detail">
      <nav className="event-detail__back" aria-label="Breadcrumb">
        <Link href="/events">← Back to events</Link>
      </nav>

      <header
        className="event-detail-hero"
        style={
          isSafeImageUrl(event.posterUrl)
            ? ({ "--poster": `url(${JSON.stringify(event.posterUrl)})` } as CSSProperties)
            : undefined
        }
      >
        <div className="event-detail-hero__media">
          {!imageUnavailable && isSafeImageUrl(event.posterUrl) ? (
            <Image
              src={event.posterUrl}
              alt=""
              fill
              sizes="(max-width: 767px) 100vw, 58vw"
              unoptimized
              priority
              onError={() => setImageUnavailable(true)}
            />
          ) : (
            <div className="event-detail-hero__fallback" aria-hidden="true">
              <span>QuickSeats</span>
            </div>
          )}
        </div>
        <div className="event-detail-hero__copy">
          <div className="event-detail-hero__badges">
            <Badge className="event-detail-hero__badge--category">{event.category}</Badge>
            <Badge className="event-detail-hero__badge--published">Published</Badge>
          </div>
          <h1>{event.title}</h1>
          <p className="event-detail-hero__date">
            {formatEventDate(event.startDate, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          <p className="event-detail-hero__location">
            {venue
              ? [venue.name, venue.address.city, venue.address.state]
                  .filter(Boolean)
                  .join(" · ")
              : "Venue details unavailable"}
          </p>
          <a className="event-detail-hero__jump" href="#event-seats">
            Book tickets
          </a>
        </div>
      </header>

      <div className="event-detail-information">
        <section className="event-detail-description" aria-labelledby="event-description-title">
          <span className="eyebrow">The event</span>
          <h2 id="event-description-title">About this experience</h2>
          <p>{event.description}</p>
        </section>
        <aside className="event-detail-facts" aria-label="Event information">
          <div>
            <h2>Date and time</h2>
            <p>{formatEventDate(event.startDate, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}</p>
            <p>
              {formatEventDate(event.startDate, { hour: "numeric", minute: "2-digit" })}
              {" – "}
              {formatEventDate(event.endDate, endTimeOptions)}
            </p>
          </div>
          {venue ? (
            <div>
              <h2>Venue</h2>
              <p>{venue.name}</p>
              {venue.description ? <p>{venue.description}</p> : null}
              <address>{getAddress(venue)}</address>
            </div>
          ) : (
            <div>
              <h2>Venue</h2>
              <p>Venue details were not included in the event response.</p>
            </div>
          )}
        </aside>
      </div>

      <hr className="section-rule" />
      {user?.role === "ORGANIZER" ? (
        <section className="event-seat-selection" aria-label="Ticket booking unavailable">
          <aside className="seat-selection-summary" role="status">
            <span className="eyebrow">Organizer account</span>
            <h2>Ticket booking is for attendees.</h2>
            <p>Organizers can manage their events, but cannot reserve or purchase tickets from an organizer account.</p>
            <Button href="/organizer/events" variant="secondary">Manage your events</Button>
          </aside>
        </section>
      ) : (
      <section className="event-seat-selection" id="event-seats" aria-label="Choose seats">
        <div className="event-seat-selection__intro">
          <span className="eyebrow">Plan your visit</span>
          <h2>Choose where you’ll be.</h2>
          <p>
            Select from the current seat map. Prices and availability are
            estimates until the backend validates a seat hold.
          </p>
        </div>
        <div className="event-seat-selection__layout">
          <SeatMap
            key={event._id}
            eventId={event._id}
            selectedSeats={selectedSeats}
            onToggleSeat={toggleSeat}
            onSeatsUnavailable={(seatIds) => {
              if (holdActive.current) {
                return;
              }
              const unavailable = new Set(seatIds);
              setSelectedSeats((seats) =>
                seats.filter((seat) => !unavailable.has(seat.id)),
              );
              setSelectionMessage(
                "A selected seat became unavailable and was removed from your selection.",
              );
            }}
          />
          {hold ? (
            <HoldPanel
              hold={hold}
              seats={heldSeats}
              paying={paying}
              releasing={releasing}
              message={holdMessage}
              onPay={() => void payForHold()}
              onRelease={() => void releaseHeldSeats()}
              onExpired={handleHoldExpired}
            />
          ) : (
            <SeatSelectionSummary
              selectedSeats={selectedSeats}
              onRemoveSeat={(seatId) => {
                setSelectedSeats((seats) => seats.filter((seat) => seat.id !== seatId));
                setSelectionMessage("");
              }}
              onContinue={() => void holdSelectedSeats()}
              continueLabel={authStatus === "authenticated" ? "Hold these seats" : "Sign in to hold seats"}
              continueLoading={holding}
              continueMessage={selectionMessage}
            />
          )}
        </div>
        <p className="event-seat-selection__backend-note">
          Selecting is not reserving: seats are only yours once the hold succeeds,
          and booked once payment is confirmed by the server.
        </p>
        <Button href="/events" variant="secondary">
          Browse other events
        </Button>
      </section>
      )}
    </div>
  );
}

export function EventDetails({ eventId }: EventDetailsProps) {
  const validEventId = /^[a-f\d]{24}$/i.test(eventId);
  const [retryIndex, setRetryIndex] = useState(0);
  const requestKey = `${eventId}:${retryIndex}`;
  const [response, setResponse] = useState<{
    key: string;
    event: EventRecord;
  } | null>(null);
  const [requestError, setRequestError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const event = response?.key === requestKey ? response.event : null;
  const error = requestError?.key === requestKey ? requestError.message : "";
  const loading = validEventId && !event && !error;

  useEffect(() => {
    if (!validEventId) {
      return;
    }

    const controller = new AbortController();
    void eventsApi
      .get(eventId, { signal: controller.signal })
      .then((nextEvent) => setResponse({ key: requestKey, event: nextEvent }))
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setRequestError({ key: requestKey, message: getEventError(requestError) });
        }
      });

    return () => controller.abort();
  }, [eventId, requestKey, validEventId]);

  if (!validEventId) {
    return (
      <div className="page-shell event-detail-state">
        <ErrorState
          title="This event link is invalid"
          description="Check the link or browse the current events."
        />
        <Button href="/events" variant="secondary">Back to events</Button>
      </div>
    );
  }

  if (loading) {
    return <LoadingState label="Loading event details…" />;
  }

  if (error || !event) {
    return (
      <div className="page-shell event-detail-state">
        <ErrorState
          title="This event is unavailable"
          description={error || "The event could not be found."}
          onRetry={() => setRetryIndex((index) => index + 1)}
        />
        <Button href="/events" variant="secondary">Back to events</Button>
      </div>
    );
  }

  return <EventDetailsContent key={event._id} event={event} />;
}
