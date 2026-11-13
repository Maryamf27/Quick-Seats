"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/states";
import { useAuth } from "@/lib/auth/auth-context";
import { adminApi } from "@/lib/api/endpoints/admin";
import type { AdminOverviewResult } from "@/lib/api/types";
import { formatMoney } from "./admin-management";

export function AdminOverview() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<AdminOverviewResult | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    adminApi.overview(accessToken, { signal: controller.signal })
      .then((result) => { setData(result); setError(false); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [accessToken, retry]);

  if (error) return <section className="organizer-section"><ErrorState title="Couldn’t load the admin overview" description="Platform metrics could not be retrieved." onRetry={() => { setError(false); setRetry((n) => n + 1); }} /></section>;
  if (!data) return <section className="organizer-section"><LoadingState label="Loading admin overview…" /></section>;

  const revenue = Object.entries(data.revenueByCurrency).map(([currency, value]) => formatMoney(value, currency)).join(" · ") || "—";
  const cards: [string, string, string][] = [
    ["Customers", data.users.toLocaleString(), "/admin/users"],
    ["Organizers", data.organizers.toLocaleString(), "/admin/organizers"],
    ["Events (published)", `${data.events.toLocaleString()} (${data.publishedEvents.toLocaleString()})`, "/admin/events"],
    ["Bookings (confirmed)", `${data.bookings.toLocaleString()} (${data.confirmedBookings.toLocaleString()})`, "/admin/bookings"],
    ["Tickets sold", data.ticketsSold.toLocaleString(), "/admin/analytics"],
    ["Paid revenue", revenue, "/admin/analytics"],
  ];

  return (
    <section className="organizer-section admin-overview">
      <header className="organizer-heading"><div><span className="eyebrow">Administration</span><h1>Platform overview</h1><p>Live totals across users, events and bookings.</p></div></header>
      <div className="organizer-stat-grid">
        {cards.map(([label, value, href]) => <article key={label}><span>{label}</span><strong>{value}</strong><Link href={href}>View details <span aria-hidden="true">→</span></Link></article>)}
      </div>
      <article className="admin-metric"><span>Organizer applications awaiting review</span><strong>{data.pendingApplications.toLocaleString()}</strong><Link href="/admin/organizer-applications">Review applications <span aria-hidden="true">→</span></Link></article>
      {data.suspendedUsers > 0 ? <p className="dashboard-note" role="status">{data.suspendedUsers} account{data.suspendedUsers === 1 ? " is" : "s are"} currently suspended.</p> : null}
    </section>
  );
}
