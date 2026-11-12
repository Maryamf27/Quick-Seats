"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";
import { eventsApi } from "@/lib/api/endpoints/events";
import { ApiError } from "@/lib/api/errors";

export function EventSeats() {
  const { eventId } = useParams<{ eventId: string }>(); const { accessToken } = useAuth(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState(false);
  async function generate() { if (!accessToken) return; setBusy(true); setError(false); setMessage(""); try { const result = await eventsApi.generateSeats(eventId, accessToken); setMessage(`${result.totalSeats} seats are ready across ${result.sections} sections.`); } catch (reason) { setError(true); setMessage(reason instanceof ApiError ? reason.message : "Seat generation failed."); } finally { setBusy(false); } }
  return <section className="organizer-section"><Link href="/organizer/events" className="dashboard-back">← My events</Link><span className="eyebrow">Event setup</span><h1>Generate event seats</h1><p>This uses the selected venue’s configured sections and prices. Seat generation follows backend rules and can only run once.</p>{message ? <p role={error ? "alert" : "status"} className={error ? "auth-form__feedback" : "organizer-success"}>{message}</p> : null}<Button type="button" loading={busy} onClick={() => void generate()}>Generate seats</Button></section>;
}
