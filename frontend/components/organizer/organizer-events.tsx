"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState, LoadingState } from "@/components/ui/states";
import { eventsApi } from "@/lib/api/endpoints/events";
import { organizerApi } from "@/lib/api/endpoints/organizer";
import type { EventRecord, OrganizerSalesSummary } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { safeImageUrl } from "@/lib/events/poster";

function formatMoney(value: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(value); }
  catch { return String(value); }
}
function venueName(event: EventRecord) { return typeof event.venueId === "string" ? "Venue details unavailable" : event.venueId?.name ?? "Venue details unavailable"; }

export function OrganizerEvents({ compact = false }: { compact?: boolean }) {
  const { accessToken } = useAuth();
  const [events, setEvents] = useState<EventRecord[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [sales, setSales] = useState<OrganizerSalesSummary | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    const to = new Date(); const from = new Date(to.getTime() - 366 * 86400000);
    Promise.all([
      eventsApi.organizerMine({ page: compact ? 1 : page, limit: compact ? 5 : 20 }, accessToken, { signal: controller.signal }),
      organizerApi.salesSummary({ from: from.toISOString(), to: to.toISOString() }, accessToken, { signal: controller.signal }),
    ]).then(([eventResult, summary]) => {
      setEvents(eventResult.events); setTotal(eventResult.pagination.total); setTotalPages(eventResult.pagination.totalPages); setSales(summary); setError(false);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [accessToken, compact, page, retry]);
  if (error) return <ErrorState title="Couldn’t load your events" description="Organizer event data is unavailable right now." onRetry={() => { setError(false); setRetry((n) => n + 1); }} />;
  if (!events || !sales) return <LoadingState label="Loading organizer events…" />;
  const salesById = new Map(sales.events.map((row) => [row.eventId, row]));
  const published = events.filter((event) => event.status === "PUBLISHED").length;
  const drafts = events.filter((event) => event.status === "DRAFT").length;
  return <section className="organizer-section">
    <header className="organizer-heading"><div><span className="eyebrow">Your events</span><h1>{compact ? "Recent events" : "My Events"}</h1><p>{total} event{total === 1 ? "" : "s"} managed by your account.</p></div>{compact ? <Link href="/organizer/events">View all</Link> : <Button href="/organizer/events/create">Create event</Button>}</header>
    {totalPages > 1 ? <p className="dashboard-note">Showing page {page} of {totalPages}. Sales figures cover the past 366 days.</p> : null}
    {events.length === 0 ? <EmptyState title="No events yet" description="Create your first event to start building your audience." action={<Button href="/organizer/events/create">Create an event</Button>} /> : <div className="organizer-event-list">
      {events.map((event) => {
        const row = salesById.get(event._id);
        const venue = typeof event.venueId === "object" && event.venueId !== null ? event.venueId : null;
        const poster = safeImageUrl(event.posterUrl);
        const revenue = row ? Object.entries(row.revenueByCurrency).map(([currency, value]) => formatMoney(value, currency)).join(" · ") || "No sales" : "No sales";
        return <article key={event._id} className="organizer-event-card">
          {poster ? <div className="organizer-event-card__poster" role="img" aria-label={`${event.title} poster`} style={{ backgroundImage: `url("${poster}")` }} /> : <div className="organizer-event-card__poster" aria-hidden="true">{event.title.slice(0, 1)}</div>}
          <div className="organizer-event-card__body"><div className="organizer-event-card__top"><div><h2>{event.title}</h2><p>{new Date(event.startDate).toLocaleString()} · {venue?.name ?? venueName(event)}{venue?.address?.city ? `, ${venue.address.city}` : ""}</p></div><Badge tone={event.status === "PUBLISHED" ? "success" : event.status === "DRAFT" ? "warning" : "default"}>{event.status}</Badge></div>
            <div className="organizer-event-card__meta"><span>{row?.ticketsSold ?? 0} tickets sold</span><span>{row?.bookings ?? 0} paid bookings</span><span>{revenue}</span></div>
            <div className="organizer-actions">{event.status === "PUBLISHED" ? <Link href={`/events/${event._id}`}>View public event</Link> : null}<Link href={`/organizer/events/${event._id}/edit`}>Edit event</Link></div>
          </div>
        </article>;
      })}
    </div>}
    {!compact && totalPages > 1 ? <nav className="organizer-pagination" aria-label="Event pages"><Button variant="secondary" size="small" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button><span>Page {page} of {totalPages}</span><Button variant="secondary" size="small" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</Button></nav> : null}
    {!compact ? <p className="organizer-note">Published {published} · Drafts {drafts} on this page. Booking and revenue figures include confirmed, paid bookings in the last 366 days.</p> : null}
  </section>;
}
