"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/states";
import { SeatMap } from "@/components/seats/seat-map";
import { SeatSelectionSummary } from "@/components/seats/seat-selection-summary";
import { ApiError } from "@/lib/api/errors";
import { eventsApi } from "@/lib/api/events";
import type { EventRecord, EventSeat, EventVenueSummary } from "@/lib/api/types";
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

  function continueToNextStep() {
    if (selectedSeatIds.length === 0) {
      return;
    }
    setSelectionMessage(
      "Your seat choices are kept on this page only. The next phase will connect them to a real seat hold; nothing has been reserved.",
    );
  }

  return (
    <div className="page-shell event-detail">
      <nav className="event-detail__back" aria-label="Breadcrumb">
        <Link href="/events">← Back to events</Link>
      </nav>

      <header className="event-detail-hero">
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
            <Badge>{event.category}</Badge>
            <Badge tone="success">Published</Badge>
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
            Explore seats
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
              const unavailable = new Set(seatIds);
              setSelectedSeats((seats) =>
                seats.filter((seat) => !unavailable.has(seat.id)),
              );
              setSelectionMessage(
                "A selected seat became unavailable and was removed from your selection.",
              );
            }}
          />
          <SeatSelectionSummary
            selectedSeats={selectedSeats}
            onRemoveSeat={(seatId) => {
              setSelectedSeats((seats) => seats.filter((seat) => seat.id !== seatId));
              setSelectionMessage("");
            }}
            onContinue={continueToNextStep}
            continueMessage={selectionMessage}
          />
        </div>
        <p className="event-seat-selection__backend-note">
          Selection is not a reservation. The backend remains the source of
          truth and must recheck seat status and price before booking.
        </p>
        <Button href="/events" variant="secondary">
          Browse other events
        </Button>
      </section>
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
