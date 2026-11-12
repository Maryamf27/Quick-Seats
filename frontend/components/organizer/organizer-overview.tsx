"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/states";
import { eventsApi } from "@/lib/api/endpoints/events";
import { organizerApi } from "@/lib/api/endpoints/organizer";
import type { OrganizerSalesSummary } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";

export function OrganizerOverview() {
  const { user, accessToken } = useAuth();
  const [summary, setSummary] = useState<OrganizerSalesSummary | null>(null);
  const [asOf, setAsOf] = useState(0);
  const [eventTotals, setEventTotals] = useState<{ total: number; published: number; drafts: number } | null>(null);
  const [error, setError] = useState(false); const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController(); const to = new Date(); const from = new Date(to.getTime() - 366 * 86400000);
    Promise.all([
      organizerApi.salesSummary({ from: from.toISOString(), to: to.toISOString() }, accessToken, { signal: controller.signal }),
      eventsApi.organizerMine({ page: 1, limit: 100 }, accessToken, { signal: controller.signal }),
    ]).then(([sales, eventResult]) => {
      setSummary(sales);
      setAsOf(Date.now());
      setEventTotals({ total: eventResult.pagination.total, published: eventResult.events.filter((event) => event.status === "PUBLISHED").length, drafts: eventResult.events.filter((event) => event.status === "DRAFT").length });
      setError(false);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [accessToken, retry]);
  if (error) return <ErrorState title="Couldn’t load organizer overview" description="Sales and event statistics are unavailable." onRetry={() => { setError(false); setRetry((n) => n + 1); }} />;
  if (!summary || !eventTotals) return <LoadingState label="Loading your organizer dashboard…" />;
  const revenue = Object.entries(summary.revenueByCurrency).map(([currency, value]) => `${currency.toUpperCase()} ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)}`).join(" · ") || "—";
  const upcoming = summary.events.filter((event) => new Date(event.startDate).getTime() >= asOf).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  return <div className="organizer-overview"><header className="organizer-heading"><div><span className="eyebrow">Organizer dashboard</span><h1>Welcome, {user?.fullName.split(" ")[0]}.</h1><p>Here is how your events have been performing.</p></div><Button href="/organizer/events/create">Create event</Button></header>
    <div className="organizer-stat-grid"><article><span>Total events</span><strong>{eventTotals.total}</strong></article><article><span>Published events</span><strong>{eventTotals.published}{eventTotals.total > 100 ? "+" : ""}</strong></article><article><span>Draft events</span><strong>{eventTotals.drafts}{eventTotals.total > 100 ? "+" : ""}</strong></article><article><span>Paid bookings · 366 days</span><strong>{summary.totalBookings}</strong></article><article><span>Tickets sold · 366 days</span><strong>{summary.totalTicketsSold}</strong></article><article><span>Revenue · 366 days</span><strong>{revenue}</strong></article></div>
    {eventTotals.total > 100 ? <p className="dashboard-note">Event status counts cover the first 100 events. Total event and sales totals come from backend data.</p> : null}
    <section className="organizer-section"><header className="organizer-heading"><div><span className="eyebrow">Coming up</span><h2>Upcoming event performance</h2></div><Link href="/organizer/events">All events</Link></header>{upcoming.length ? <ul className="organizer-upcoming">{upcoming.slice(0, 4).map((event) => <li key={event.eventId}><Link href={`/organizer/events/${event.eventId}/edit`}><strong>{event.title}</strong><span>{new Date(event.startDate).toLocaleString()} · {event.ticketsSold} tickets · {event.bookings} paid bookings</span></Link></li>)}</ul> : <p className="organizer-empty">No upcoming events yet.</p>}</section>
  </div>;
}
