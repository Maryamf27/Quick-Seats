"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState, LoadingState } from "@/components/ui/states";
import { eventsApi } from "@/lib/api/endpoints/events";
import { organizerApi } from "@/lib/api/endpoints/organizer";
import type {
  EventRecord,
  OrganizerEventListResult,
  OrganizerSalesSummary,
} from "@/lib/api/types";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-context";
import { safeImageUrl } from "@/lib/events/poster";

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(value);
  } catch {
    return String(value);
  }
}

function venueName(event: EventRecord): string {
  return typeof event.venueId === "string"
    ? "Venue details unavailable"
    : event.venueId?.name ?? "Venue details unavailable";
}

export function OrganizerEvents({ compact = false }: { compact?: boolean }) {
  const { accessToken } = useAuth();
  const { notify } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const [deletingId, setDeletingId] = useState("");
  const [eventState, setEventState] = useState<{
    key: string;
    result: OrganizerEventListResult;
  } | null>(null);
  const [salesState, setSalesState] = useState<{
    key: string;
    result: OrganizerSalesSummary;
  } | null>(null);
  const [eventErrorKey, setEventErrorKey] = useState("");
  const [salesErrorKey, setSalesErrorKey] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const requestKey = `${compact ? "compact" : "full"}:${page}:${retry}`;
  const eventResult = eventState?.key === requestKey ? eventState.result : null;
  const sales = salesState?.key === requestKey ? salesState.result : null;
  const eventError = eventErrorKey === requestKey;
  const salesError = salesErrorKey === requestKey;

  useEffect(() => {
    if (!accessToken) return;

    const controller = new AbortController();
    const to = new Date();
    const from = new Date(to.getTime() - 366 * 24 * 60 * 60 * 1000);

    void eventsApi
      .organizerMine(
        { page: compact ? 1 : page, limit: compact ? 5 : 20 },
        accessToken,
        { signal: controller.signal },
      )
      .then((result) => setEventState({ key: requestKey, result }))
      .catch(() => {
        if (!controller.signal.aborted) setEventErrorKey(requestKey);
      });

    void organizerApi
      .salesSummary(
        { from: from.toISOString(), to: to.toISOString() },
        accessToken,
        { signal: controller.signal },
      )
      .then((result) => setSalesState({ key: requestKey, result }))
      .catch(() => {
        if (!controller.signal.aborted) setSalesErrorKey(requestKey);
      });

    return () => controller.abort();
  }, [accessToken, compact, page, requestKey]);

  async function deleteEvent(event: EventRecord) {
    if (!accessToken || deletingId) return;
    if (!(await confirm({ title: "Delete this event?", description: `“${event.title}” and its unsold seats will be permanently removed. This cannot be undone.`, confirmLabel: "Delete event" }))) return;
    setDeletingId(event._id);
    try {
      await eventsApi.delete(event._id, accessToken);
      notify("Event deleted.", "success");
      setRetry((current) => current + 1);
    } catch (error: unknown) {
      notify(
        error instanceof ApiError && error.backendMessage
          ? error.backendMessage
          : "The event could not be deleted.",
        "error",
      );
    } finally {
      setDeletingId("");
    }
  }

  if (eventError) {
    return (
      <ErrorState
        title="Couldn’t load your events"
        description="Your organizer event list could not be retrieved."
        onRetry={() => setRetry((current) => current + 1)}
      />
    );
  }
  if (!eventResult) return <LoadingState label="Loading organizer events…" />;

  const salesById = new Map(sales?.events.map((row) => [row.eventId, row] as const) ?? []);
  const published = eventResult.events.filter((event) => event.status === "PUBLISHED").length;
  const drafts = eventResult.events.filter((event) => event.status === "DRAFT").length;
  const total = eventResult.pagination.total;
  const totalPages = eventResult.pagination.totalPages;

  return (
    <section className="organizer-section">
      <header className="organizer-heading">
        <div>
          <span className="eyebrow">Your events</span>
          <h1>{compact ? "Recent events" : "My Events"}</h1>
          <p>{total} event{total === 1 ? "" : "s"} managed by your account.</p>
        </div>
        {compact ? (
          <Link href="/organizer/events">View all</Link>
        ) : (
          <Button href="/organizer/events/create">Create event</Button>
        )}
      </header>

      {!compact && totalPages > 1 ? (
        <p className="dashboard-note">Showing page {page} of {totalPages}.</p>
      ) : null}
      {salesError ? (
        <p className="dashboard-note" role="status">
          Sales figures are unavailable right now. Your event list is still up to date.
        </p>
      ) : null}
      {!sales && !salesError ? (
        <p className="dashboard-note" role="status">Loading sales figures…</p>
      ) : null}

      {eventResult.events.length === 0 ? (
        <EmptyState
          title="No events yet"
          description="Create your first event to start building your audience."
          action={<Button href="/organizer/events/create">Create an event</Button>}
        />
      ) : (
        <div className="organizer-event-list">
          {eventResult.events.map((event) => {
            const row = salesById.get(event._id);
            const venue = typeof event.venueId === "object" && event.venueId !== null
              ? event.venueId
              : null;
            const poster = safeImageUrl(event.posterUrl);
            const revenue = !sales
              ? "Unavailable"
              : row
                ? Object.entries(row.revenueByCurrency)
                    .map(([currency, value]) => formatMoney(value, currency))
                    .join(" · ") || "No sales"
                : "Unavailable";

            return (
              <article key={event._id} className="organizer-event-card">
                {poster ? (
                  <div
                    className="organizer-event-card__poster"
                    role="img"
                    aria-label={`${event.title} poster`}
                    style={{ backgroundImage: `url("${poster}")` }}
                  />
                ) : (
                  <div className="organizer-event-card__poster" aria-hidden="true">
                    {event.title.slice(0, 1)}
                  </div>
                )}
                <div className="organizer-event-card__body">
                  <div className="organizer-event-card__top">
                    <div>
                      <h2>{event.title}</h2>
                      <p>
                        {new Date(event.startDate).toLocaleString()} · {venue?.name ?? venueName(event)}
                        {venue?.address?.city ? `, ${venue.address.city}` : ""}
                      </p>
                    </div>
                    <Badge tone={event.status === "PUBLISHED" ? "success" : event.status === "DRAFT" ? "warning" : "default"}>
                      {event.status}
                    </Badge>
                  </div>
                  <dl className="organizer-event-card__meta">
                    <div>
                      <dt>Tickets sold</dt>
                      <dd>{row ? row.ticketsSold.toLocaleString() : "Unavailable"}</dd>
                    </div>
                    <div>
                      <dt>Paid bookings</dt>
                      <dd>{row ? row.bookings.toLocaleString() : "Unavailable"}</dd>
                    </div>
                    <div>
                      <dt>Revenue</dt>
                      <dd>{revenue}</dd>
                    </div>
                  </dl>
                  <div className="organizer-actions">
                    {event.status === "PUBLISHED" ? (
                      <Link href={`/events/${event._id}`}>View public event</Link>
                    ) : null}
                    <Link href={`/organizer/events/${event._id}/edit`}>Edit event</Link>
                    {!compact ? (
                      <Button
                        variant="destructive"
                        size="small"
                        loading={deletingId === event._id}
                        disabled={Boolean(deletingId)}
                        onClick={() => void deleteEvent(event)}
                      >
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!compact && totalPages > 1 ? (
        <nav className="organizer-pagination" aria-label="Event pages">
          <Button
            variant="secondary"
            size="small"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </Button>
          <span>Page {page} of {totalPages}</span>
          <Button
            variant="secondary"
            size="small"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}
      {!compact ? (
        <p className="organizer-note">
          Published {published} · Drafts {drafts} on this page. Booking and revenue figures include confirmed, paid bookings in the last 366 days.
        </p>
      ) : null}
      {dialog}
    </section>
  );
}
