"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { EventRecord } from "@/lib/api/types";
import {
  fallbackBackground,
  getVenue,
  longDate,
  safeImageUrl,
  shortDate,
} from "@/lib/events/poster";

export function EventCard({ event }: { event: EventRecord }) {
  const imageUrl = safeImageUrl(event.posterUrl);
  const [imageUnavailable, setImageUnavailable] = useState(!imageUrl);
  const venue = getVenue(event.venueId);
  const city = venue?.address?.city;
  const location = venue ? [venue.name, city].filter(Boolean).join(" · ") : "";
  const date = shortDate(event.startDate);
  let startingPrice = "";
  if (event.startingPrice !== undefined && event.startingPrice !== null && event.currency) {
    try {
      startingPrice = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: event.currency.toUpperCase(),
      }).format(event.startingPrice);
    } catch {
      startingPrice = "";
    }
  }

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
              sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 20vw"
              unoptimized
              onError={() => setImageUnavailable(true)}
            />
          ) : (
            <div
              className="event-card__image-fallback"
              style={{ background: fallbackBackground(event.category) }}
              aria-hidden="true"
            >
              <span>{event.title}</span>
            </div>
          )}
          {date ? (
            <span className="event-card__date-badge" aria-hidden="true">
              <b>{date.day}</b>
              {date.month}
            </span>
          ) : null}
          <span className="event-card__category">{event.category}</span>
          <span className="event-card__cta" aria-hidden="true">Book tickets</span>
        </div>
        <div className="event-card__content">
          <h3 className="event-card__title">{event.title}</h3>
          <p className="event-card__date">{longDate(event.startDate)}</p>
          {location ? <p className="event-card__location">{location}</p> : null}
          {startingPrice ? <p className="event-card__price">From {startingPrice}</p> : null}
        </div>
      </Link>
    </article>
  );
}
