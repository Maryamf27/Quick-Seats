"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { EventRecord, EventVenueSummary } from "@/lib/api/types";

function getVenue(venue: EventRecord["venueId"]): EventVenueSummary | null {
  return typeof venue === "object" && venue !== null ? venue : null;
}

function formatEventDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Date to be announced";
  }
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getSafeImageUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function EventCard({ event }: { event: EventRecord }) {
  const imageUrl = getSafeImageUrl(event.posterUrl);
  const [imageUnavailable, setImageUnavailable] = useState(!imageUrl);
  const venue = getVenue(event.venueId);
  const city = venue?.address?.city;
  const location = city ? `${venue.name} · ${city}` : venue?.name;

  return (
    <article className="event-card">
      <Link
        className="event-card__link"
        href={`/events/${encodeURIComponent(event._id)}`}
        aria-label={`View ${event.title}`}
      >
        <div className="event-card__media">
          {!imageUnavailable && imageUrl ? (
            <Image
              className="event-card__image"
              src={imageUrl}
              alt=""
              fill
              sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
              unoptimized
              onError={() => setImageUnavailable(true)}
            />
          ) : (
            <div className="event-card__image-fallback" aria-hidden="true">
              <span>QuickSeats</span>
            </div>
          )}
          <span className="event-card__category">{event.category}</span>
        </div>
        <div className="event-card__content">
          <h3 className="event-card__title">{event.title}</h3>
          <p className="event-card__date">{formatEventDate(event.startDate)}</p>
          {location ? <p className="event-card__location">{location}</p> : null}
        </div>
      </Link>
    </article>
  );
}
