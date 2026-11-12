"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { eventsApi } from "@/lib/api/events";
import type { EventRecord } from "@/lib/api/types";
import {
  fallbackBackground,
  getVenue,
  longDate,
  safeImageUrl,
} from "@/lib/events/poster";

const SLIDE_MS = 5500;

export function HeroCarousel() {
  const [events, setEvents] = useState<EventRecord[] | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const controller = new AbortController();
    eventsApi
      .list({ limit: 5, sortBy: "startDate", order: "asc" }, { signal: controller.signal })
      .then((r) => setEvents(r.events))
      .catch(() => {
        if (!controller.signal.aborted) setEvents([]);
      });
    return () => controller.abort();
  }, []);

  const count = events?.length ?? 0;
  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );

  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  if (events === null) {
    return <div className="hero-carousel hero-carousel--loading" aria-hidden="true" />;
  }
  if (count === 0) {
    return (
      <section className="hero-carousel hero-carousel--empty">
        <div className="page-shell hero-carousel__empty">
          <h1>Live events. Real seats. Booked in seconds.</h1>
          <p>No events are on sale right now — check back soon.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="hero-carousel"
      aria-roledescription="carousel"
      aria-label="Featured events"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {events.map((event, i) => {
        const image = safeImageUrl(event.posterUrl);
        const venue = getVenue(event.venueId);
        const active = i === index;
        return (
          <div
            key={event._id}
            className={`hero-slide${active ? " hero-slide--active" : ""}`}
            aria-hidden={!active}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
          >
            {image && !failedImages.has(event._id) ? (
              <Image
                src={image}
                alt=""
                fill
                sizes="100vw"
                unoptimized
                priority={i === 0}
                className="hero-slide__image"
                onError={() => setFailedImages((current) => new Set(current).add(event._id))}
              />
            ) : (
              <div
                className="hero-slide__image hero-slide__fallback"
                style={{ background: fallbackBackground(event.category) }}
              />
            )}
            <div className="hero-slide__shade" />
            <div className="page-shell hero-slide__content">
              <span className="hero-slide__tag">{event.category}</span>
              <h2>{event.title}</h2>
              <p>
                {longDate(event.startDate)}
                {venue ? ` · ${venue.name}${venue.address?.city ? `, ${venue.address.city}` : ""}` : ""}
              </p>
              <Link
                className="hero-slide__cta"
                href={`/events/${encodeURIComponent(event._id)}`}
                tabIndex={active ? 0 : -1}
              >
                Book tickets
              </Link>
            </div>
          </div>
        );
      })}
      {count > 1 ? (
        <>
          <button type="button" className="hero-carousel__arrow hero-carousel__arrow--prev" aria-label="Previous event" onClick={() => go(index - 1)}>
            ‹
          </button>
          <button type="button" className="hero-carousel__arrow hero-carousel__arrow--next" aria-label="Next event" onClick={() => go(index + 1)}>
            ›
          </button>
          <div className="hero-carousel__dots">
            {events.map((event, i) => (
              <button
                key={event._id}
                type="button"
                aria-label={`Show ${event.title}`}
                aria-current={i === index}
                className={i === index ? "is-active" : ""}
                onClick={() => go(i)}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
