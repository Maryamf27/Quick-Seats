"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { LoadingState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminApi } from "@/lib/api/endpoints/admin";
import { ApiError } from "@/lib/api/errors";
import type {
  AdminAnalyticsResult,
  AdminBookingRow,
  AdminEventRow,
  AdminOrganizer,
  AdminUser,
  Pagination,
} from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";

export function formatMoney(value: number, currency: string | null): string {
  if (!currency) return String(value);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(value);
  } catch {
    return `${value} ${currency.toUpperCase()}`;
  }
}

function formatRevenue(map: Record<string, number>): string {
  const parts = Object.entries(map).map(([currency, value]) => formatMoney(value, currency));
  return parts.length ? parts.join(" · ") : "—";
}

function useAdminList<T>(load: (token: string, signal: AbortSignal) => Promise<{ items: T[]; pagination: Pagination }>, params: unknown[]) {
  const { accessToken } = useAuth();
  const [state, setState] = useState<{ items: T[]; pagination: Pagination } | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const loadRef = useRef(load);
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    loadRef.current(accessToken, controller.signal)
      .then((result) => { setState(result); setError(false); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [accessToken, paramsKey, retry]);

  return {
    state,
    error,
    reload: () => { setError(false); setRetry((n) => n + 1); },
    patch: (fn: (items: T[]) => T[]) => setState((current) => (current ? { ...current, items: fn(current.items) } : current)),
  };
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="organizer-section">
      <header className="organizer-heading"><div><span className="eyebrow">Administration</span><h1>{title}</h1><p>{description}</p></div></header>
      {children}
    </section>
  );
}

function Pager({ page, pagination, onChange }: { page: number; pagination: Pagination; onChange: (page: number) => void }) {
  if (pagination.totalPages <= 1) return null;
  return (
    <nav className="organizer-pagination" aria-label="Pages">
      <Button variant="secondary" size="small" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
      <span>Page {page} of {pagination.totalPages} · {pagination.total.toLocaleString()} total</span>
      <Button variant="secondary" size="small" disabled={page >= pagination.totalPages} onClick={() => onChange(page + 1)}>Next</Button>
    </nav>
  );
}

function SearchBar({ value, onSubmit, placeholder, children }: { value: string; onSubmit: (value: string) => void; placeholder: string; children?: ReactNode }) {
  const [draft, setDraft] = useState(value);
  return (
    <form className="admin-filters" role="search" onSubmit={(event) => { event.preventDefault(); onSubmit(draft.trim()); }}>
      <input type="search" aria-label={placeholder} placeholder={placeholder} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={100} />
      {children}
      <Button type="submit" size="small" variant="secondary">Search</Button>
    </form>
  );
}

function Table({ head, children, empty, className }: { head: string[]; children: ReactNode[]; empty: string; className?: string }) {
  if (children.length === 0) return <p className="organizer-empty">{empty}</p>;
  return (
    <div className="organizer-table-wrap">
      <table className={`organizer-table${className ? ` ${className}` : ""}`}>
        <thead><tr>{head.map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const date = (value: string) => new Date(value).toLocaleDateString();

export function AdminUsers() {
  const { accessToken, user: me } = useAuth();
  const { notify } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"" | "USER" | "ORGANIZER" | "ADMIN">("");
  const [busy, setBusy] = useState("");
  const list = useAdminList<AdminUser>(async (token, signal) => {
    const result = await adminApi.users({ page, limit: 20, search: search || undefined, role: role || undefined }, token, { signal });
    return { items: result.users, pagination: result.pagination };
  }, [page, search, role]);

  async function change(target: AdminUser, changes: { role?: "USER" | "ORGANIZER"; isSuspended?: boolean }) {
    if (!accessToken || busy) return;
    if (changes.isSuspended && !(await confirm({ title: "Suspend this user?", description: `${target.email} will be signed out and unable to access their account until restored.`, confirmLabel: "Suspend user" }))) return;
    setBusy(target._id);
    try {
      const updated = await adminApi.updateUser(target._id, changes, accessToken);
      list.patch((items) => items.map((item) => (item._id === updated._id ? updated : item)));
      notify("User updated.", "success");
    } catch (error: unknown) {
      notify(error instanceof ApiError && error.backendMessage ? error.backendMessage : "The user could not be updated.", "error");
    } finally {
      setBusy("");
    }
  }

  return (
    <Section title="Users" description="Search accounts, change organizer access and suspend or restore accounts.">
      <SearchBar value={search} placeholder="Search name or email" onSubmit={(value) => { setSearch(value); setPage(1); }}>
        <Select aria-label="Filter by role" value={role} options={[{ value: "", label: "All roles" }, { value: "USER", label: "Customers" }, { value: "ORGANIZER", label: "Organizers" }, { value: "ADMIN", label: "Admins" }]} onChange={(next) => { setRole(next as typeof role); setPage(1); }} />
      </SearchBar>
      {list.error ? <ErrorState title="Couldn’t load users" description="The user directory could not be retrieved." onRetry={list.reload} />
        : !list.state ? <LoadingState label="Loading users…" /> : (
          <>
            <Table className="admin-users-table" head={["#", "Name", "Role", "Status", "Joined", "Actions"]} empty="No users match these filters.">
              {list.state.items.map((item, index) => {
                const locked = item.role === "ADMIN" || item._id === me?._id;
                return (
                  <tr key={item._id}>
                    <td>{(page - 1) * 20 + index + 1}</td>
                    <td>{item.fullName}<small>{item.email}</small></td>
                    <td>{item.role}</td>
                    <td>{item.isSuspended ? <Badge tone="danger">Suspended</Badge> : <Badge tone="success">Active</Badge>}</td>
                    <td>{date(item.createdAt)}</td>
                    <td>{locked ? <small>Protected</small> : (
                      <div className="organizer-actions">
                        <Button size="small" variant="secondary" disabled={Boolean(busy)} loading={busy === item._id} onClick={() => void change(item, { role: item.role === "ORGANIZER" ? "USER" : "ORGANIZER" })}>{item.role === "ORGANIZER" ? "Remove organizer" : "Make organizer"}</Button>
                        <Button size="small" variant={item.isSuspended ? "secondary" : "destructive"} disabled={Boolean(busy)} onClick={() => void change(item, { isSuspended: !item.isSuspended })}>{item.isSuspended ? "Restore" : "Suspend"}</Button>
                      </div>
                    )}</td>
                  </tr>
                );
              })}
            </Table>
            <Pager page={page} pagination={list.state.pagination} onChange={setPage} />
          </>
        )}
      {dialog}
    </Section>
  );
}

export function AdminOrganizers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const list = useAdminList<AdminOrganizer>(async (token, signal) => {
    const result = await adminApi.organizers({ page, limit: 20, search: search || undefined }, token, { signal });
    return { items: result.organizers, pagination: result.pagination };
  }, [page, search]);

  return (
    <Section title="Organizers" description="Approved organizers with their business and event activity.">
      <SearchBar value={search} placeholder="Search name or email" onSubmit={(value) => { setSearch(value); setPage(1); }} />
      {list.error ? <ErrorState title="Couldn’t load organizers" description="The organizer directory could not be retrieved." onRetry={list.reload} />
        : !list.state ? <LoadingState label="Loading organizers…" /> : (
          <>
            <Table head={["Organizer", "Business", "Events", "Published", "Status", "Joined"]} empty="No organizers found.">
              {list.state.items.map((item) => (
                <tr key={item._id}>
                  <td>{item.fullName}<small>{item.email}</small></td>
                  <td>{item.businessName ?? "—"}</td>
                  <td>{item.eventCount}</td>
                  <td>{item.publishedEventCount}</td>
                  <td>{item.isSuspended ? <Badge tone="danger">Suspended</Badge> : <Badge tone="success">Active</Badge>}</td>
                  <td>{date(item.createdAt)}</td>
                </tr>
              ))}
            </Table>
            <Pager page={page} pagination={list.state.pagination} onChange={setPage} />
          </>
        )}
    </Section>
  );
}

const EVENT_STATUSES = ["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"] as const;

export function AdminEvents() {
  const { accessToken } = useAuth();
  const { notify } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState("");
  const list = useAdminList<AdminEventRow>(async (token, signal) => {
    const result = await adminApi.events({ page, limit: 20, search: search || undefined, status: (status || undefined) as AdminEventRow["status"] | undefined }, token, { signal });
    return { items: result.events, pagination: result.pagination };
  }, [page, search, status]);

  async function unpublish(target: AdminEventRow) {
    if (!accessToken || busy) return;
    if (!(await confirm({ title: "Unpublish this event?", description: `“${target.title}” will be removed from public listings and returned to drafts.`, confirmLabel: "Unpublish event" }))) return;
    setBusy(target._id);
    try {
      const result = await adminApi.unpublishEvent(target._id, accessToken);
      list.patch((items) => items.map((item) => (item._id === target._id ? { ...item, status: result.status } : item)));
      notify("Event unpublished.", "success");
    } catch (error: unknown) {
      notify(error instanceof ApiError && error.backendMessage ? error.backendMessage : "The event could not be unpublished.", "error");
    } finally {
      setBusy("");
    }
  }

  async function cancel(target: AdminEventRow) {
    if (!accessToken || busy) return;
    if (!(await confirm({ title: "Cancel this event?", description: `Every confirmed booking for “${target.title}” will be cancelled and refunded. This cannot be undone.`, confirmLabel: "Cancel event" }))) return;
    setBusy(target._id);
    try {
      const result = await adminApi.cancelEvent(target._id, accessToken);
      list.patch((items) => items.map((item) => (item._id === target._id ? { ...item, status: result.status } : item)));
      notify(result.cancelledBookings > 0 ? `Event cancelled. ${result.cancelledBookings} booking${result.cancelledBookings === 1 ? "" : "s"} queued for refund.` : "Event cancelled.", "success");
    } catch (error: unknown) {
      notify(error instanceof ApiError && error.backendMessage ? error.backendMessage : "The event could not be cancelled.", "error");
    } finally {
      setBusy("");
    }
  }

  return (
    <Section title="Events" description="Every event on the platform, whatever its publication status.">
      <SearchBar value={search} placeholder="Search event title" onSubmit={(value) => { setSearch(value); setPage(1); }}>
        <Select aria-label="Filter by status" value={status} options={[{ value: "", label: "All statuses" }, ...EVENT_STATUSES.map((value) => ({ value, label: value }))]} onChange={(next) => { setStatus(next); setPage(1); }} />
      </SearchBar>
      {list.error ? <ErrorState title="Couldn’t load events" description="The event directory could not be retrieved." onRetry={list.reload} />
        : !list.state ? <LoadingState label="Loading events…" /> : (
          <>
            {list.state.items.length === 0 ? <p className="organizer-empty">No events match these filters.</p> : <div className="admin-events-list" aria-label="Events">
              {list.state.items.map((item) => {
                const organizer = typeof item.organizerId === "object" ? item.organizerId : null;
                const venue = typeof item.venueId === "object" ? item.venueId : null;
                const closed = item.status === "CANCELLED" || item.status === "COMPLETED";
                return (
                  <article className="admin-event-card" key={item._id}>
                    <div className="admin-event-card__heading">
                      <div className="admin-event-card__title"><h2>{item.title}</h2><span>{item.category}</span></div>
                      <Badge tone={item.status === "PUBLISHED" ? "success" : item.status === "DRAFT" ? "warning" : "default"}>{item.status}</Badge>
                    </div>
                    <dl className="admin-event-card__details">
                      <div><dt>Organizer</dt><dd>{organizer?.fullName ?? "Unknown"}<small>{organizer?.email ?? ""}</small></dd></div>
                      <div><dt>Venue</dt><dd>{venue?.name ?? "Venue unavailable"}<small>{venue?.address?.city ?? ""}</small></dd></div>
                      <div><dt>Starts</dt><dd>{new Date(item.startDate).toLocaleString()}</dd></div>
                    </dl>
                    <div className="admin-event-card__actions">
                      {closed ? <span className="admin-event-card__closed">No actions available</span> : <>
                        {item.status === "PUBLISHED" ? <Button size="small" variant="secondary" disabled={Boolean(busy)} loading={busy === item._id} onClick={() => void unpublish(item)}>Unpublish</Button> : null}
                        <Button size="small" variant="destructive" disabled={Boolean(busy)} onClick={() => void cancel(item)}>Cancel event</Button>
                      </>}
                    </div>
                  </article>
                );
              })}
            </div>}
            <Pager page={page} pagination={list.state.pagination} onChange={setPage} />
          </>
        )}
      {dialog}
    </Section>
  );
}

const BOOKING_STATUSES = ["PENDING", "CONFIRMED", "CANCELLED", "EXPIRED"] as const;

export function AdminBookings() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const list = useAdminList<AdminBookingRow>(async (token, signal) => {
    const result = await adminApi.bookings({ page, limit: 20, status: (status || undefined) as AdminBookingRow["status"] | undefined }, token, { signal });
    return { items: result.bookings, pagination: result.pagination };
  }, [page, status]);

  return (
    <Section title="Bookings" description="All customer bookings with payment and refund state.">
      <div className="admin-filters">
        <Select aria-label="Filter by status" value={status} options={[{ value: "", label: "All statuses" }, ...BOOKING_STATUSES.map((value) => ({ value, label: value }))]} onChange={(next) => { setStatus(next); setPage(1); }} />
      </div>
      {list.error ? <ErrorState title="Couldn’t load bookings" description="The booking directory could not be retrieved." onRetry={list.reload} />
        : !list.state ? <LoadingState label="Loading bookings…" /> : (
          <>
            <Table head={["Customer", "Event", "Tickets", "Total", "Status", "Payment", "Created"]} empty="No bookings match this filter.">
              {list.state.items.map((item) => {
                const customer = item.user && typeof item.user === "object" ? item.user : null;
                const event = item.event && typeof item.event === "object" ? item.event : null;
                return (
                  <tr key={item.id}>
                    <td>{customer?.fullName ?? "Deleted user"}<small>{customer?.email ?? ""}</small></td>
                    <td>{event?.title ?? "Deleted event"}</td>
                    <td>{item.ticketCount}</td>
                    <td>{formatMoney(item.totalAmount, item.currency)}</td>
                    <td><Badge tone={item.status === "CONFIRMED" ? "success" : item.status === "PENDING" ? "warning" : "default"}>{item.status}</Badge></td>
                    <td>{item.paymentStatus}{item.requiresRefund ? <small>Refund {item.refundStatus.toLowerCase()}</small> : null}</td>
                    <td>{date(item.createdAt)}</td>
                  </tr>
                );
              })}
            </Table>
            <Pager page={page} pagination={list.state.pagination} onChange={setPage} />
          </>
        )}
    </Section>
  );
}

export function AdminAnalytics() {
  const { accessToken } = useAuth();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AdminAnalyticsResult | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    adminApi.analytics({ from: from.toISOString(), to: to.toISOString() }, accessToken, { signal: controller.signal })
      .then((result) => { setData(result); setError(false); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [accessToken, days, retry]);

  const range = (
    <div className="admin-filters">
      <Select aria-label="Time range" value={String(days)} options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }, { value: "365", label: "Last 12 months" }]} onChange={(next) => { setData(null); setDays(Number(next)); }} />
    </div>
  );

  if (error) return <Section title="Analytics" description="Platform-wide sales and growth."><ErrorState title="Couldn’t load analytics" description="Platform analytics could not be retrieved." onRetry={() => { setError(false); setRetry((n) => n + 1); }} /></Section>;
  if (!data) return <Section title="Analytics" description="Platform-wide sales and growth.">{range}<LoadingState label="Loading analytics…" /></Section>;

  const revenue: Record<string, number> = {};
  let tickets = 0;
  let bookings = 0;
  for (const row of data.dailySales) {
    const key = row.currency ?? "unknown";
    revenue[key] = (revenue[key] ?? 0) + row.revenue;
    tickets += row.tickets;
    bookings += row.bookings;
  }
  const newUsers = data.userGrowth.reduce((sum, row) => sum + row.users, 0);

  return (
    <Section title="Analytics" description="Platform-wide sales and growth for the selected period.">
      {range}
      <div className="organizer-stat-grid">
        <article><span>Revenue (paid)</span><strong>{formatRevenue(revenue)}</strong></article>
        <article><span>Paid bookings</span><strong>{bookings.toLocaleString()}</strong></article>
        <article><span>Tickets sold</span><strong>{tickets.toLocaleString()}</strong></article>
        <article><span>New users</span><strong>{newUsers.toLocaleString()}</strong></article>
        <article><span>All bookings created</span><strong>{Object.values(data.bookingsByStatus).reduce((a, b) => a + b, 0).toLocaleString()}</strong></article>
        <article><span>Confirmed / cancelled / expired</span><strong>{(data.bookingsByStatus.CONFIRMED ?? 0)} / {(data.bookingsByStatus.CANCELLED ?? 0)} / {(data.bookingsByStatus.EXPIRED ?? 0)}</strong></article>
      </div>
      <section className="admin-panel"><div className="admin-panel__heading"><h2>Top events by revenue</h2></div>
        <Table head={["Event", "Category", "Bookings", "Tickets", "Revenue"]} empty="No paid bookings in this period.">
          {data.topEvents.map((row) => <tr key={row.eventId}><td>{row.title}</td><td>{row.category ?? "—"}</td><td>{row.bookings}</td><td>{row.tickets}</td><td>{formatMoney(row.revenue, row.currency)}</td></tr>)}
        </Table>
      </section>
      <section className="admin-panel"><div className="admin-panel__heading"><h2>Events by category</h2></div>
        <Table head={["Category", "Events"]} empty="No events yet.">
          {data.categories.map((row) => <tr key={row.category}><td>{row.category}</td><td>{row.events}</td></tr>)}
        </Table>
      </section>
      <section className="admin-panel"><div className="admin-panel__heading"><h2>Daily sales</h2></div>
        <Table head={["Day", "Bookings", "Tickets", "Revenue"]} empty="No paid bookings in this period.">
          {data.dailySales.map((row) => <tr key={`${row.day}-${row.currency}`}><td>{row.day}</td><td>{row.bookings}</td><td>{row.tickets}</td><td>{formatMoney(row.revenue, row.currency)}</td></tr>)}
        </Table>
      </section>
    </Section>
  );
}
