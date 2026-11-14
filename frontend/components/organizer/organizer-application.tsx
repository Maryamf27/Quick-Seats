"use client";

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
  const status = application?.status;
  return (
    <section className="onboarding-v2">
      <header className="dashboard-heading">
        <div>
          <span className="eyebrow">QuickSeats partners</span>
          <h1>Become an organizer</h1>
          <p>Sell tickets to your own events. Tell us about your organization and our team will review your request.</p>
        </div>
      </header>
      <div className="onboarding-v2__grid">
        <div className="onboarding-v2__main">
          {application ? (
            <div className={`onboarding-v2__status onboarding-v2__status--${status?.toLowerCase()}`}>
              <span className="onboarding-v2__status-badge">{status === "PENDING" ? "In review" : status === "REJECTED" ? "Not approved" : "Approved"}</span>
              <h2>{status === "PENDING" ? "Your application is being reviewed" : status === "REJECTED" ? "Your application wasn’t approved" : "Your organizer access is ready"}</h2>
              <p>{status === "PENDING" ? "An administrator will review your request soon. You can keep booking events in the meantime." : status === "REJECTED" ? "Contact QuickSeats support if you need more information about this decision." : "You can now create events, generate seats and track your sales."}</p>
              {status === "APPROVED" ? <Button href="/organizer/dashboard">Open organizer dashboard</Button> : <Button href="/events" variant="secondary">Browse events</Button>}
            </div>
          ) : (
            <form className="organizer-form onboarding-v2__form" onSubmit={(event) => void submit(event)}>
              <h2>Your application</h2>
              <Input label="Organization or business name" name="businessName" value={businessName} onChange={(event) => setBusinessName(event.target.value)} minLength={2} maxLength={120} required disabled={busy} />
              <label className="organizer-form__field">About your organization<textarea name="description" value={description} onChange={(event) => setDescription(event.target.value)} minLength={20} maxLength={2000} required disabled={busy} rows={6} aria-describedby="organizer-description-hint" /></label>
              <small id="organizer-description-hint">At least 20 characters. Share what kinds of events you organize. {description.trim().length > 0 ? `(${description.trim().length}/2000)` : null}</small>
              {error ? <p role="alert" className="auth-form__feedback">{error}</p> : null}
              <Button type="submit" loading={busy}>Submit application</Button>
            </form>
          )}
        </div>
        <aside className="onboarding-v2__aside" aria-label="About organizer accounts">
          <h2>What you get</h2>
          <ul className="onboarding-v2__perks">
            <li><strong>Publish events</strong><span>Create events with dates, venues, pricing and posters.</span></li>
            <li><strong>Live seat maps</strong><span>Generate seats and let customers pick exactly where they sit.</span></li>
            <li><strong>Sales insights</strong><span>Track bookings, revenue and a weekly sales summary by email.</span></li>
          </ul>
          <h2>How it works</h2>
          <ol className="onboarding-v2__steps">
            <li><span>1</span>Submit this short application.</li>
            <li><span>2</span>An administrator reviews your request.</li>
            <li><span>3</span>Once approved, your organizer dashboard unlocks.</li>
          </ol>
        </aside>
      </div>
    </section>
  );
}
