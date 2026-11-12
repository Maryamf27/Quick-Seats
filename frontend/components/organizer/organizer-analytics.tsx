"use client";

import { useEffect, useState } from "react";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/states";
import { organizerApi } from "@/lib/api/endpoints/organizer";
import type { OrganizerSalesSummary } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";

export function OrganizerAnalytics() {
  const { accessToken } = useAuth(); const [summary, setSummary] = useState<OrganizerSalesSummary | null>(null); const [error, setError] = useState(false); const [retry, setRetry] = useState(0);
  useEffect(() => { if (!accessToken) return; const controller = new AbortController(); const to = new Date(); const from = new Date(to.getTime() - 366 * 86400000); organizerApi.salesSummary({ from: from.toISOString(), to: to.toISOString() }, accessToken, { signal: controller.signal }).then(setSummary).catch(() => { if (!controller.signal.aborted) setError(true); }); return () => controller.abort(); }, [accessToken, retry]);
  if (error) return <ErrorState title="Couldn’t load sales analytics" description="The organizer sales summary could not be retrieved." onRetry={() => { setError(false); setRetry((n) => n + 1); }} />;
  if (!summary) return <LoadingState label="Loading sales analytics…" />;
  function format(value: number, currency: string) { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(value); } catch { return String(value); } }
  return <section className="organizer-section"><header className="organizer-heading"><div><span className="eyebrow">Sales performance</span><h1>Analytics</h1><p>Confirmed, paid bookings from {new Date(summary.from).toLocaleDateString()} to {new Date(summary.to).toLocaleDateString()}.</p></div></header><div className="organizer-stat-grid"><article><span>Bookings</span><strong>{summary.totalBookings}</strong></article><article><span>Tickets sold</span><strong>{summary.totalTicketsSold}</strong></article><article><span>Events</span><strong>{summary.eventCount}</strong></article><article><span>Revenue by currency</span><strong>{Object.entries(summary.revenueByCurrency).map(([currency, value]) => format(value, currency)).join(" · ") || "—"}</strong></article></div><h2 className="organizer-subheading">Sales by event</h2><div className="organizer-table-wrap"><table className="organizer-table"><thead><tr><th>Event</th><th>Date</th><th>Bookings</th><th>Tickets</th><th>Revenue</th></tr></thead><tbody>{summary.events.map((row) => <tr key={row.eventId}><td>{row.title}<small>{row.category}</small></td><td>{new Date(row.startDate).toLocaleDateString()}</td><td>{row.bookings}</td><td>{row.ticketsSold}</td><td>{Object.entries(row.revenueByCurrency).map(([currency, value]) => format(value, currency)).join(" · ") || "—"}</td></tr>)}</tbody></table>{summary.events.length === 0 ? <p className="organizer-empty">No events or sales were found.</p> : null}</div><p className="organizer-note">Revenue reflects confirmed bookings with paid status, grouped by currency. Reporting is limited to a 366-day date range by the backend.</p></section>;
}
