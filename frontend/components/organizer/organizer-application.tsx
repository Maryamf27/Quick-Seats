"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/states";
import { useAuth } from "@/lib/auth/auth-context";
import { organizerApplicationsApi } from "@/lib/api/endpoints/organizer-applications";
import type { OrganizerApplication } from "@/lib/api/types";
import { ApiError } from "@/lib/api/errors";

export function OrganizerApplicationView() {
  const { user, accessToken, refreshSession } = useAuth(); const router = useRouter();
  const [application, setApplication] = useState<OrganizerApplication | null | undefined>(undefined);
  const [businessName, setBusinessName] = useState(""); const [description, setDescription] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    organizerApplicationsApi.mine(accessToken, { signal: controller.signal }).then((result) => { setApplication(result); if (result?.status === "APPROVED") void refreshSession(); }).catch(() => { if (!controller.signal.aborted) setError("We couldn’t check your application status."); });
    return () => controller.abort();
  }, [accessToken, refreshSession, retry]);
  useEffect(() => { if (user?.role === "ORGANIZER") router.replace("/organizer/dashboard"); }, [router, user]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!accessToken) return;
    setError(""); setBusy(true);
    try { setApplication(await organizerApplicationsApi.submit({ businessName, description }, accessToken)); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "Your application could not be submitted."); }
    finally { setBusy(false); }
  }
  if (user?.role === "ORGANIZER") return <LoadingState label="Opening your organizer dashboard…" />;
  if (application === undefined && !error) return <LoadingState label="Checking your application…" />;
  if (error && application === undefined) return <ErrorState title="Application status unavailable" description={error} onRetry={() => { setError(""); setRetry((n) => n + 1); }} />;
  return <main className="onboarding page-shell"><Link href="/dashboard" className="dashboard-back">← Customer dashboard</Link><span className="eyebrow">QuickSeats partners</span><h1>Become an organizer</h1><p>Tell us about your organization. Our team will review your request before organizer access is granted.</p>
    {application ? <div className="onboarding-status"><strong>Application {application.status.toLowerCase()}</strong><p>{application.status === "PENDING" ? "Your request is waiting for an administrator to review it." : application.status === "REJECTED" ? "Your request was not approved. Contact QuickSeats support if you need more information." : "Your organizer access is ready."}</p>{application.status === "APPROVED" ? <Button href="/organizer/dashboard">Open organizer dashboard</Button> : null}</div> : <form className="organizer-form" onSubmit={(event) => void submit(event)}>
      <Input label="Organization or business name" name="businessName" value={businessName} onChange={(event) => setBusinessName(event.target.value)} minLength={2} maxLength={120} required disabled={busy} />
      <label className="organizer-form__field">About your organization<textarea name="description" value={description} onChange={(event) => setDescription(event.target.value)} minLength={20} maxLength={2000} required disabled={busy} rows={6} aria-describedby="organizer-description-hint" /></label><small id="organizer-description-hint">At least 20 characters. Share what kinds of events you organize.</small>
      {error ? <p role="alert" className="auth-form__feedback">{error}</p> : null}<Button type="submit" loading={busy}>Submit application</Button>
    </form>}
  </main>;
}
