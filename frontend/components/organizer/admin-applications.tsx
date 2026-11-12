"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/states";
import { useAuth } from "@/lib/auth/auth-context";
import { organizerApplicationsApi } from "@/lib/api/endpoints/organizer-applications";
import type { OrganizerApplication } from "@/lib/api/types";

export function AdminApplications() {
  const { accessToken } = useAuth(); const [rows, setRows] = useState<OrganizerApplication[] | null>(null); const [page, setPage] = useState(1); const [totalPages, setTotalPages] = useState(1); const [error, setError] = useState(false); const [busy, setBusy] = useState(""); const [retry, setRetry] = useState(0);
  useEffect(() => { if (!accessToken) return; const controller = new AbortController(); organizerApplicationsApi.list({ page, limit: 20, status: "PENDING" }, accessToken, { signal: controller.signal }).then((r) => { setRows(r.applications); setTotalPages(r.pagination.totalPages); setError(false); }).catch(() => { if (!controller.signal.aborted) setError(true); }); return () => controller.abort(); }, [accessToken, page, retry]);
  async function decide(id: string, decision: "APPROVED" | "REJECTED") { if (!accessToken) return; if (decision === "REJECTED" && !window.confirm("Reject this organizer application? This decision will be recorded.")) return; setBusy(id); try { await organizerApplicationsApi.decide(id, decision, accessToken); setRows((items) => items?.filter((item) => item._id !== id) ?? []); } catch { setError(true); } finally { setBusy(""); } }
  if (error) return <ErrorState title="Couldn’t load applications" description="Organizer applications could not be retrieved or reviewed." onRetry={() => { setError(false); setRetry((n) => n + 1); }} />;
  if (!rows) return <LoadingState label="Loading applications…" />;
  return <section className="organizer-section"><header className="organizer-heading"><div><span className="eyebrow">Administration</span><h1>Organizer applications</h1><p>Review access requests from QuickSeats customers.</p></div></header>{rows.length === 0 ? <p className="organizer-empty">There are no pending applications on this page.</p> : <ul className="organizer-application-list">{rows.map((item) => { const applicant = typeof item.userId === "object" ? item.userId : null; return <li key={item._id}><div className="organizer-application-list__heading"><div><h2>{item.businessName}</h2><p>{applicant?.fullName ?? "Customer"} · {applicant?.email ?? ""}</p></div><Badge tone="warning">Pending</Badge></div><p>{item.description}</p><small>Submitted {new Date(item.createdAt).toLocaleDateString()}</small><div className="organizer-actions"><Button size="small" loading={busy === item._id} disabled={Boolean(busy)} onClick={() => void decide(item._id, "APPROVED")}>Approve</Button><Button variant="destructive" size="small" disabled={Boolean(busy)} onClick={() => void decide(item._id, "REJECTED")}>Reject</Button></div></li>; })}</ul>}{totalPages > 1 ? <nav className="organizer-pagination" aria-label="Application pages"><Button variant="secondary" size="small" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button><span>Page {page} of {totalPages}</span><Button variant="secondary" size="small" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</Button></nav> : null}</section>;
}
