"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState, LoadingState } from "@/components/ui/states";
import { bookingsApi } from "@/lib/api/endpoints/bookings";
import type { MyBooking } from "@/lib/api/types";
import { longDate } from "@/lib/events/poster";
import { useAuth } from "@/lib/auth/auth-context";

function confirmed(b: MyBooking) { return b.status === "CONFIRMED" && b.paymentStatus === "PAID"; }
function dateOf(b: MyBooking) { return b.event ? new Date(b.event.startDate).getTime() : 0; }
function amount(v: number, currency: string | null) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: (currency ?? "USD").toUpperCase() }).format(v); }
  catch { return String(v); }
}

export function DashboardOverview() {
  const { user, accessToken } = useAuth();
  const [snapshot, setSnapshot] = useState<{ bookings: MyBooking[]; total: number; asOf: number } | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    bookingsApi.mine({ page: 1, limit: 100 }, accessToken, { signal: controller.signal })
      .then((result) => { setSnapshot({ bookings: result.bookings, total: result.pagination.total, asOf: Date.now() }); setError(false); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [accessToken, retry]);

  if (error) return <ErrorState title="Couldn’t load your dashboard" description="Your booking information is unavailable right now." onRetry={() => setRetry((n) => n + 1)} />;
  if (!snapshot) return <LoadingState label="Loading your dashboard…" />;
  const { bookings, total, asOf: now } = snapshot;
  const confirmedBookings = bookings.filter(confirmed);
  const upcoming = confirmedBookings.filter((b) => dateOf(b) >= now).sort((a, b) => dateOf(a) - dateOf(b));
  const completed = confirmedBookings.filter((b) => dateOf(b) > 0 && dateOf(b) < now).length;
  const cancelled = bookings.filter((b) => b.status === "CANCELLED").length;
  return <div className="dashboard-overview">
    <header className="dashboard-heading"><div><span className="eyebrow">Your QuickSeats</span><h1>Welcome back, {user?.fullName.split(" ")[0]}.</h1><p>Your plans, all in one place. Find your next good night out.</p></div><Button href="/events">Browse events</Button></header>
    {bookings.length < total && <p className="dashboard-note">Booking totals below reflect the latest 100 of {total} records. Use My Bookings to browse the complete paginated history.</p>}
    <section className="dashboard-stats" aria-label="Booking statistics">
      <article><span>Total bookings</span><strong>{total}</strong></article>
      <article><span>Upcoming events</span><strong>{upcoming.length}{bookings.length < total ? "+" : ""}</strong></article>
      <article><span>Completed</span><strong>{completed}{bookings.length < total ? "+" : ""}</strong></article>
      <article><span>Cancelled</span><strong>{cancelled}{bookings.length < total ? "+" : ""}</strong></article>
    </section>
    <section className="dashboard-section">
      <div className="dashboard-section__heading"><div><span className="eyebrow">Coming up</span><h2>Your next events</h2></div><Link href="/dashboard/bookings">View all bookings <span aria-hidden="true">→</span></Link></div>
      {upcoming.length === 0 ? <EmptyState title="Nothing on the calendar yet" description="When you book an upcoming event, it will show up here." action={<Button href="/events">Browse events</Button>} /> : <ul className="dashboard-booking-list">{upcoming.slice(0, 4).map((b) => <li key={b.id}><Link href={`/dashboard/bookings/${b.id}`} className="dashboard-booking"><span className="dashboard-booking__date">{b.event ? new Date(b.event.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}</span><span className="dashboard-booking__copy"><strong>{b.event?.title ?? "Event details unavailable"}</strong><small>{b.event ? longDate(b.event.startDate) : "Date unavailable"} · {b.seats.length} {b.seats.length === 1 ? "seat" : "seats"}</small><small>Reference {b.id}</small></span><span className="dashboard-booking__end"><Badge tone="success">Confirmed</Badge><strong>{amount(b.totalAmount, b.currency)}</strong></span></Link></li>)}</ul>}
    </section>
  </div>;
}
