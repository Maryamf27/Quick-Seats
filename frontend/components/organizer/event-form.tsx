"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/states";
import { eventsApi } from "@/lib/api/endpoints/events";
import { venuesApi } from "@/lib/api/endpoints/venues";
import { useAuth } from "@/lib/auth/auth-context";
import { ApiError } from "@/lib/api/errors";
import type { EventRecord, Venue } from "@/lib/api/types";

type Fields = { title: string; description: string; category: string; venueId: string; startDate: string; endDate: string; posterUrl: string; status: EventRecord["status"] };
const blank: Fields = { title: "", description: "", category: "", venueId: "", startDate: "", endDate: "", posterUrl: "", status: "DRAFT" };
function toLocalInput(value: string) { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

export function EventForm({ editing = false }: { editing?: boolean }) {
  const { eventId } = useParams<{ eventId: string }>(); const { accessToken } = useAuth(); const router = useRouter();
  const [fields, setFields] = useState<Fields>(blank); const [venues, setVenues] = useState<Venue[]>([]); const [loading, setLoading] = useState(editing); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [createdId, setCreatedId] = useState("");
  useEffect(() => { const controller = new AbortController(); const tasks: Promise<unknown>[] = [venuesApi.list({ page: 1, limit: 100 }, { signal: controller.signal }).then((r) => setVenues(r.venues))]; if (editing && accessToken) tasks.push(eventsApi.organizerGet(eventId, accessToken, { signal: controller.signal }).then((event) => setFields({ title: event.title, description: event.description, category: event.category, venueId: typeof event.venueId === "string" ? event.venueId : event.venueId._id, startDate: toLocalInput(event.startDate), endDate: toLocalInput(event.endDate), posterUrl: event.posterUrl ?? "", status: event.status }))); Promise.all(tasks).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof ApiError ? reason.message : "Event information could not be loaded."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [accessToken, editing, eventId]);
  function set<K extends keyof Fields>(key: K, value: Fields[K]) { setFields((current) => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!accessToken) return; setError(""); if (new Date(fields.endDate) <= new Date(fields.startDate)) { setError("End time must be after the start time."); return; } setBusy(true); try { if (editing) { await eventsApi.update(eventId, { title: fields.title, description: fields.description, category: fields.category, startDate: new Date(fields.startDate).toISOString(), endDate: new Date(fields.endDate).toISOString(), posterUrl: fields.posterUrl || null, status: fields.status }, accessToken); router.push("/organizer/events"); return; } if (createdId) { await eventsApi.generateSeats(createdId, accessToken); router.push("/organizer/events"); return; } const created = await eventsApi.create({ title: fields.title, description: fields.description, category: fields.category, venueId: fields.venueId, startDate: new Date(fields.startDate).toISOString(), endDate: new Date(fields.endDate).toISOString(), ...(fields.posterUrl ? { posterUrl: fields.posterUrl } : {}) }, accessToken); setCreatedId(created._id); try { await eventsApi.generateSeats(created._id, accessToken); router.push("/organizer/events"); } catch { setError("Your draft event was created, but seats could not be generated. Retry below to generate them."); } } catch (reason) { setError(reason instanceof ApiError ? reason.message : "Event changes could not be saved."); } finally { setBusy(false); } }
  if (loading) return <LoadingState label="Loading event form…" />;
  if (error && editing && !fields.title) return <ErrorState title="Event unavailable" description="This event could not be loaded for your account." />;
  return <section className="organizer-section"><header className="organizer-heading"><div><span className="eyebrow">Event management</span><h1>{editing ? "Edit event" : "Create an event"}</h1><p>{editing ? "Update your event details and publication status." : "New events are created as drafts."}</p></div></header><form className="organizer-form" onSubmit={(event) => void submit(event)}>
    <Input label="Event title" name="title" value={fields.title} onChange={(event) => set("title", event.target.value)} required maxLength={200} disabled={busy} />
    <label className="organizer-form__field">Description<textarea value={fields.description} onChange={(event) => set("description", event.target.value)} rows={6} required minLength={1} maxLength={10000} disabled={busy} /></label>
    <div className="organizer-form__grid"><Input label="Category" value={fields.category} onChange={(event) => set("category", event.target.value)} required maxLength={100} disabled={busy} /><label className="organizer-form__field">Venue<select value={fields.venueId} onChange={(event) => set("venueId", event.target.value)} required disabled={busy || editing}><option value="">Choose a venue</option>{venues.map((venue) => <option key={venue._id} value={venue._id}>{venue.name} · {venue.address.city}</option>)}</select>{editing ? <small>Venue changes are not supported by the event update API.</small> : null}</label></div>
    <div className="organizer-form__grid"><Input label="Start date and time" type="datetime-local" value={fields.startDate} onChange={(event) => set("startDate", event.target.value)} required disabled={busy} /><Input label="End date and time" type="datetime-local" value={fields.endDate} onChange={(event) => set("endDate", event.target.value)} required disabled={busy} /></div>
    <Input label="Poster image URL (optional)" type="url" value={fields.posterUrl} onChange={(event) => set("posterUrl", event.target.value)} maxLength={2048} disabled={busy} />
    {editing ? <label className="organizer-form__field">Publication status<select value={fields.status} onChange={(event) => set("status", event.target.value as EventRecord["status"])} disabled={busy}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="CANCELLED">Cancelled</option><option value="COMPLETED">Completed</option></select></label> : null}
    {error ? <p className="auth-form__feedback" role="alert">{error} {createdId ? <a href={`/organizer/events/${createdId}/seats`}>Open seat setup</a> : null}</p> : null}<div className="organizer-actions"><Button type="submit" loading={busy}>{editing ? "Save changes" : createdId ? "Retry seat generation" : "Create draft and generate seats"}</Button><Button href="/organizer/events" variant="secondary" disabled={busy}>Cancel</Button></div>
  </form></section>;
}
