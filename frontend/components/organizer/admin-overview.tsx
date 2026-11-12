"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/states";
import { useAuth } from "@/lib/auth/auth-context";
import { organizerApplicationsApi } from "@/lib/api/endpoints/organizer-applications";
import type { OrganizerApplication } from "@/lib/api/types";

export function AdminOverview() {
  const { accessToken } = useAuth();
  const [applications, setApplications] = useState<OrganizerApplication[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    organizerApplicationsApi.list({ page: 1, limit: 5, status: "PENDING" }, accessToken, { signal: controller.signal })
      .then((result) => {
        setApplications(result.applications);
        setTotal(result.pagination.total);
        setError(false);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [accessToken, retry]);

  if (error) return <section className="organizer-section"><ErrorState title="Couldn’t load the admin overview" description="Pending organizer applications could not be retrieved." onRetry={() => { setError(false); setRetry((value) => value + 1); }} /></section>;
  if (!applications || total === null) return <section className="organizer-section"><LoadingState label="Loading admin overview…" /></section>;

  return (
    <section className="organizer-section admin-overview">
      <header className="organizer-heading"><div><span className="eyebrow">Administration</span><h1>Platform overview</h1><p>Review the organizer access requests currently awaiting a decision.</p></div></header>
      <article className="admin-metric"><span>Organizer applications awaiting review</span><strong>{total.toLocaleString()}</strong><Link href="/admin/organizer-applications">Review applications <span aria-hidden="true">→</span></Link></article>
      <section className="admin-panel" aria-labelledby="admin-pending-title">
        <div className="admin-panel__heading"><div><h2 id="admin-pending-title">Pending applications</h2><p>Latest items returned by the review API.</p></div><Link href="/admin/organizer-applications">View all</Link></div>
        {applications.length === 0 ? <p className="organizer-empty">There are no pending organizer applications.</p> : (
          <ul className="admin-pending-list">{applications.map((item) => {
            const applicant = typeof item.userId === "object" ? item.userId : null;
            return <li key={item._id}><div><strong>{item.businessName}</strong><span>{applicant?.fullName ?? "Customer"}{applicant?.email ? ` · ${applicant.email}` : ""}</span></div><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString()}</time></li>;
          })}</ul>
        )}
      </section>
      <section className="admin-api-note"><h2>Platform metrics are not available yet</h2><p>The backend does not currently expose administrator aggregation endpoints for users, events, bookings, ticket sales, revenue, or activity. This overview only displays the real pending-application count and records returned by the existing admin API.</p></section>
    </section>
  );
}
