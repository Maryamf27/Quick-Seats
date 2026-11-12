"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState, LoadingState } from "@/components/ui/states";
import { bookingsApi } from "@/lib/api/endpoints/bookings";
import type { MyBooking } from "@/lib/api/types";
import { longDate } from "@/lib/events/poster";
import { useAuth } from "@/lib/auth/auth-context";

const filters = ["all", "upcoming", "completed", "cancelled"] as const;
type Filter = typeof filters[number];
function filterOf(value: string | null): Filter { return filters.includes(value as Filter) ? value as Filter : "all"; }
function confirmed(b: MyBooking) { return b.status === "CONFIRMED" && b.paymentStatus === "PAID"; }
function matches(b: MyBooking, filter: Filter, now: number) {
  if (filter === "all") return true;
  if (filter === "cancelled") return b.status === "CANCELLED";
  if (!confirmed(b) || !b.event) return false;
  return filter === "upcoming" ? new Date(b.event.startDate).getTime() >= now : new Date(b.event.startDate).getTime() < now;
}
function amount(v: number, currency: string | null) { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: (currency ?? "USD").toUpperCase() }).format(v); } catch { return String(v); } }
function label(b: MyBooking) { return b.status === "PENDING" && b.paymentStatus === "FAILED" ? "Payment declined" : b.status.toLowerCase(); }
function tone(b: MyBooking): "success" | "warning" | "danger" { return confirmed(b) ? "success" : b.status === "PENDING" ? "warning" : "danger"; }

export function BookingHistory() {
  const { accessToken } = useAuth();
  const params = useSearchParams(); const router = useRouter(); const pathname = usePathname();
  const filter = filterOf(params.get("filter"));
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [data, setData] = useState<{ bookings: MyBooking[]; totalPages: number; total: number; page: number; asOf: number } | null>(null);
  const [error, setError] = useState<number | null>(null); const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    bookingsApi.mine({ page, limit: 10 }, accessToken, { signal: controller.signal }).then((result) => { setData({ bookings: result.bookings, totalPages: result.pagination.totalPages, total: result.pagination.total, page, asOf: Date.now() }); setError(null); }).catch(() => { if (!controller.signal.aborted) setError(page); });
    return () => controller.abort();
  }, [accessToken, page, retry]);
  function selectFilter(next: Filter) { const query = new URLSearchParams(params.toString()); if (next === "all") query.delete("filter"); else query.set("filter", next); query.delete("page"); router.replace(`${pathname}${query.size ? `?${query}` : ""}`); }
  function selectPage(next: number) { const query = new URLSearchParams(params.toString()); if (next === 1) query.delete("page"); else query.set("page", String(next)); router.replace(`${pathname}?${query}`); }
  if (error === page) return <ErrorState title="Couldn’t load bookings" description="Your booking history is unavailable right now." onRetry={() => setRetry((n) => n + 1)} />;
  if (!data || data.page !== page) return <LoadingState label="Loading your bookings…" />;
  const shown = data.bookings.filter((b) => matches(b, filter, data.asOf));
  return <section className="dashboard-section">
    <header className="dashboard-heading"><div><span className="eyebrow">Your history</span><h1>My bookings</h1><p>{data.total} booking{data.total === 1 ? "" : "s"} across your account.</p></div><Button href="/events" variant="secondary">Find an event</Button></header>
    <div className="booking-filters" role="group" aria-label="Filter bookings">{filters.map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => selectFilter(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
    {shown.length === 0 ? <EmptyState title={data.total === 0 ? "No bookings yet" : "No bookings in this view"} description={data.total === 0 ? "Your event plans will appear here once you book." : "Try another filter or browse upcoming events."} action={<Button href="/events">Browse events</Button>} /> : <ul className="dashboard-booking-list">{shown.map((b) => <li key={b.id}><Link href={`/dashboard/bookings/${b.id}`} className="dashboard-booking"><span className="dashboard-booking__date">{b.event ? new Date(b.event.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}</span><span className="dashboard-booking__copy"><strong>{b.event?.title ?? "Event details unavailable"}</strong><small>{b.event ? longDate(b.event.startDate) : "Date unavailable"}</small><small>Ref {b.id} · {b.seats.length} {b.seats.length === 1 ? "seat" : "seats"}{b.seats.length ? ` · ${b.seats.map((s) => `${s.section} ${s.row}${s.seatNumber}`).join(", ")}` : ""}</small></span><span className="dashboard-booking__end"><Badge tone={tone(b)}>{label(b)}</Badge><strong>{amount(b.totalAmount, b.currency)}</strong><small>Payment {b.paymentStatus.toLowerCase()}</small></span></Link></li>)}</ul>}
    {data.totalPages > 1 && <nav className="booking-pagination" aria-label="Booking pages"><Button variant="secondary" size="small" disabled={page <= 1} onClick={() => selectPage(page - 1)}>Previous</Button><span>Page {page} of {data.totalPages}</span><Button variant="secondary" size="small" disabled={page >= data.totalPages} onClick={() => selectPage(page + 1)}>Next</Button></nav>}
  </section>;
}
