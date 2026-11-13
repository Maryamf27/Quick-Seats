"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Select } from "@/components/ui/select";
import { EmptyState, LoadingState } from "@/components/ui/states";
import { eventsApi } from "@/lib/api/endpoints/events";
import { organizerApi } from "@/lib/api/endpoints/organizer";
import type { BookingStatus, EventRecord, OrganizerBookingRow, Pagination } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";

const STATUSES: BookingStatus[] = ["CONFIRMED", "PENDING", "CANCELLED", "EXPIRED"];

function money(value: number, currency: string | null): string {
  if (!currency) return String(value);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(value);
  } catch {
    return `${value} ${currency.toUpperCase()}`;
  }
}

function seatLabel(seat: OrganizerBookingRow["seats"][number]): string {
  return `${seat.section} ${seat.row}${seat.seatNumber}`;
}

export function OrganizerBookings() {
  const { accessToken } = useAuth();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [eventId, setEventId] = useState("");
  const [status, setStatus] = useState<BookingStatus | "">("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ bookings: OrganizerBookingRow[]; pagination: Pagination } | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    eventsApi.organizerMine({ page: 1, limit: 100 }, accessToken, { signal: controller.signal })
      .then((result) => setEvents(result.events))
      .catch(() => { /* the filter is optional; the list still works without it */ });
    return () => controller.abort();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    organizerApi.bookings(
      { page, limit: 20, eventId: eventId || undefined, status: status || undefined },
      accessToken,
      { signal: controller.signal },
    )
      .then((result) => { setData(result); setError(false); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [accessToken, page, eventId, status, retry]);

  const heading = (
    <header className="organizer-heading">
      <div>
        <span className="eyebrow">Sales operations</span>
        <h1>Event bookings</h1>
        <p>Bookings for your events. Customers are shown by name only; contact and payment details stay private.</p>
      </div>
    </header>
  );

  return (
    <section className="organizer-section">
      {heading}
      <div className="admin-filters">
        <Select aria-label="Filter by event" value={eventId} options={[{ value: "", label: "All events" }, ...events.map((event) => ({ value: event._id, label: event.title }))]} onChange={(next) => { setData(null); setEventId(next); setPage(1); }} />
        <Select aria-label="Filter by status" value={status} options={[{ value: "", label: "All statuses" }, ...STATUSES.map((value) => ({ value, label: value }))]} onChange={(next) => { setData(null); setStatus(next as BookingStatus | ""); setPage(1); }} />
      </div>

      {error ? (
        <ErrorState title="Couldn’t load bookings" description="Your bookings could not be retrieved." onRetry={() => { setError(false); setRetry((n) => n + 1); }} />
      ) : !data ? (
        <LoadingState label="Loading bookings…" />
      ) : data.bookings.length === 0 ? (
        <EmptyState title="No bookings found" description="Bookings will appear here once customers reserve seats for your events." />
      ) : (
        <>
          <div className="organizer-table-wrap">
            <table className="organizer-table">
              <thead>
                <tr>{["Customer", "Event", "Seats", "Total", "Status", "Payment", "Booked"].map((label) => <th key={label} scope="col">{label}</th>)}</tr>
              </thead>
              <tbody>
                {data.bookings.map((booking) => (
                  <tr key={booking.id}>
                    <td>{booking.customerName}</td>
                    <td>{booking.eventTitle}{booking.eventStartDate ? <small>{new Date(booking.eventStartDate).toLocaleString()}</small> : null}</td>
                    <td>{booking.ticketCount}<small>{booking.seats.map(seatLabel).join(", ")}</small></td>
                    <td>{money(booking.totalAmount, booking.currency)}</td>
                    <td><Badge tone={booking.status === "CONFIRMED" ? "success" : booking.status === "PENDING" ? "warning" : "default"}>{booking.status}</Badge></td>
                    <td>{booking.paymentStatus}</td>
                    <td>{new Date(booking.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.pagination.totalPages > 1 ? (
            <nav className="organizer-pagination" aria-label="Booking pages">
              <Button variant="secondary" size="small" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button>
              <span>Page {page} of {data.pagination.totalPages} · {data.pagination.total.toLocaleString()} total</span>
              <Button variant="secondary" size="small" disabled={page >= data.pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Next</Button>
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}
