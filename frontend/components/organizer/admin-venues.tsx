"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { EmptyState, LoadingState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { venuesApi } from "@/lib/api/endpoints/venues";
import { ApiError } from "@/lib/api/errors";
import type { Pagination, SeatCategory, Venue } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.backendMessage ? error.backendMessage : fallback;
}

export function AdminVenues() {
  const { accessToken } = useAuth();
  const { notify } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [data, setData] = useState<{ venues: Venue[]; pagination: Pagination } | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [deleting, setDeleting] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    venuesApi.list({ page, limit: 20, search: search || undefined }, { signal: controller.signal })
      .then((result) => { setData(result); setError(false); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [page, search, retry]);

  async function remove(venue: Venue) {
    if (!accessToken || deleting) return;
    if (!window.confirm(`Delete "${venue.name}"? This cannot be undone.`)) return;
    setDeleting(venue._id);
    try {
      await venuesApi.delete(venue._id, accessToken);
      notify("Venue deleted.", "success");
      setRetry((n) => n + 1);
    } catch (reason: unknown) {
      notify(errorText(reason, "The venue could not be deleted."), "error");
    } finally {
      setDeleting("");
    }
  }

  return (
    <section className="organizer-section">
      <header className="organizer-heading">
        <div>
          <span className="eyebrow">Administration</span>
          <h1>Venues</h1>
          <p>Venues define the sections and seat layout that organizers build events on.</p>
        </div>
        <Button href="/admin/venues/new">Add venue</Button>
      </header>
      <form className="admin-filters" role="search" onSubmit={(event) => { event.preventDefault(); setData(null); setSearch(draft.trim()); setPage(1); }}>
        <input type="search" aria-label="Search venues" placeholder="Search venue name" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={100} />
        <Button type="submit" size="small" variant="secondary">Search</Button>
      </form>
      {error ? <ErrorState title="Couldn’t load venues" description="The venue list could not be retrieved." onRetry={() => { setError(false); setRetry((n) => n + 1); }} />
        : !data ? <LoadingState label="Loading venues…" />
        : data.venues.length === 0 ? <EmptyState title="No venues" description="Add a venue so organizers can create events." action={<Button href="/admin/venues/new">Add venue</Button>} />
        : (
          <>
            <div className="organizer-table-wrap">
              <table className="organizer-table">
                <thead><tr>{["Venue", "City", "Capacity", "Sections", "Actions"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
                <tbody>
                  {data.venues.map((venue) => (
                    <tr key={venue._id}>
                      <td>{venue.name}</td>
                      <td>{venue.address.city}<small>{venue.address.country}</small></td>
                      <td>{venue.capacity.toLocaleString()}</td>
                      <td>{venue.sections.length}</td>
                      <td>
                        <div className="organizer-actions">
                          <Link href={`/admin/venues/${venue._id}/edit`}>Edit</Link>
                          <Button size="small" variant="destructive" loading={deleting === venue._id} disabled={Boolean(deleting)} onClick={() => void remove(venue)}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.pagination.totalPages > 1 ? (
              <nav className="organizer-pagination" aria-label="Venue pages">
                <Button variant="secondary" size="small" disabled={page <= 1} onClick={() => { setData(null); setPage((p) => p - 1); }}>Previous</Button>
                <span>Page {page} of {data.pagination.totalPages}</span>
                <Button variant="secondary" size="small" disabled={page >= data.pagination.totalPages} onClick={() => { setData(null); setPage((p) => p + 1); }}>Next</Button>
              </nav>
            ) : null}
          </>
        )}
    </section>
  );
}

interface SectionFields { name: string; rows: string; seatsPerRow: string; seatCategory: SeatCategory; price: string }
interface VenueFields {
  name: string; description: string; street: string; city: string; state: string; country: string; postalCode: string; capacity: string; sections: SectionFields[];
}

const blankSection = (): SectionFields => ({ name: "", rows: "", seatsPerRow: "", seatCategory: "STANDARD", price: "" });
const blankVenue = (): VenueFields => ({ name: "", description: "", street: "", city: "", state: "", country: "", postalCode: "", capacity: "", sections: [blankSection()] });

function fromVenue(venue: Venue): VenueFields {
  return {
    name: venue.name, description: venue.description ?? "",
    street: venue.address.street, city: venue.address.city, state: venue.address.state,
    country: venue.address.country, postalCode: venue.address.postalCode,
    capacity: String(venue.capacity),
    sections: venue.sections.map((section) => ({
      name: section.name, rows: String(section.rows), seatsPerRow: String(section.seatsPerRow),
      seatCategory: section.seatCategory, price: String(section.price ?? ""),
    })),
  };
}

function toPayload(fields: VenueFields): { payload?: Parameters<typeof venuesApi.create>[0]; problem?: string } {
  const capacity = Number(fields.capacity);
  if (!Number.isInteger(capacity) || capacity <= 0) return { problem: "Capacity must be a positive whole number." };
  if (fields.sections.length === 0) return { problem: "Add at least one section." };
  const sections = [];
  for (const [index, section] of fields.sections.entries()) {
    const rows = Number(section.rows);
    const seatsPerRow = Number(section.seatsPerRow);
    const price = Number(section.price);
    if (!section.name.trim()) return { problem: `Section ${index + 1} needs a name.` };
    if (!Number.isInteger(rows) || rows <= 0 || !Number.isInteger(seatsPerRow) || seatsPerRow <= 0) {
      return { problem: `Section "${section.name}" needs whole-number rows and seats per row.` };
    }
    if (section.price === "" || !Number.isFinite(price) || price < 0) return { problem: `Section "${section.name}" needs a price of 0 or more.` };
    sections.push({ name: section.name.trim(), rows, seatsPerRow, seatCategory: section.seatCategory, price });
  }
  const names = sections.map((section) => section.name.toLowerCase());
  if (new Set(names).size !== names.length) return { problem: "Section names must be unique." };
  const seatCount = sections.reduce((total, section) => total + section.rows * section.seatsPerRow, 0);
  if (seatCount > capacity) return { problem: `Sections add up to ${seatCount} seats, which exceeds the capacity of ${capacity}.` };
  return {
    payload: {
      name: fields.name.trim(), description: fields.description.trim(),
      address: { street: fields.street.trim(), city: fields.city.trim(), state: fields.state.trim(), country: fields.country.trim(), postalCode: fields.postalCode.trim() },
      capacity, sections,
    },
  };
}

export function VenueForm({ editing = false }: { editing?: boolean }) {
  const { venueId } = useParams<{ venueId: string }>();
  const { accessToken } = useAuth();
  const { notify } = useToast();
  const router = useRouter();
  const [fields, setFields] = useState<VenueFields>(blankVenue);
  const [loading, setLoading] = useState(editing);
  const [loadFailed, setLoadFailed] = useState(false);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    const controller = new AbortController();
    venuesApi.get(venueId, { signal: controller.signal })
      .then((venue) => setFields(fromVenue(venue)))
      .catch(() => { if (!controller.signal.aborted) setLoadFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [editing, venueId]);

  function set<K extends keyof VenueFields>(key: K, value: VenueFields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
  }
  function setSection(index: number, changes: Partial<SectionFields>) {
    setFields((current) => ({ ...current, sections: current.sections.map((section, i) => (i === index ? { ...section, ...changes } : section)) }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    const { payload, problem: invalid } = toPayload(fields);
    if (!payload) return setProblem(invalid ?? "Check the venue details.");
    setProblem("");
    setBusy(true);
    try {
      if (editing) await venuesApi.update(venueId, payload, accessToken);
      else await venuesApi.create(payload, accessToken);
      notify(editing ? "Venue updated." : "Venue created.", "success");
      router.push("/admin/venues");
    } catch (reason: unknown) {
      setProblem(errorText(reason, "The venue could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading venue…" />;
  if (loadFailed) return <ErrorState title="Venue unavailable" description="This venue could not be loaded." />;

  return (
    <section className="organizer-section">
      <header className="organizer-heading">
        <div>
          <span className="eyebrow">Administration</span>
          <h1>{editing ? "Edit venue" : "Add a venue"}</h1>
          <p>{editing ? "Changes apply to events created afterwards; seats already generated for existing events are not changed." : "Define the venue’s address, capacity and seating sections."}</p>
        </div>
      </header>
      <form className="organizer-form" onSubmit={(event) => void submit(event)}>
        <Input label="Venue name" value={fields.name} onChange={(event) => set("name", event.target.value)} required maxLength={150} disabled={busy} />
        <label className="organizer-form__field">Description<textarea value={fields.description} onChange={(event) => set("description", event.target.value)} rows={4} maxLength={5000} disabled={busy} /></label>
        <Input label="Street" value={fields.street} onChange={(event) => set("street", event.target.value)} required maxLength={200} disabled={busy} />
        <div className="organizer-form__grid">
          <Input label="City" value={fields.city} onChange={(event) => set("city", event.target.value)} required maxLength={100} disabled={busy} />
          <Input label="State / province" value={fields.state} onChange={(event) => set("state", event.target.value)} required maxLength={100} disabled={busy} />
          <Input label="Country" value={fields.country} onChange={(event) => set("country", event.target.value)} required maxLength={100} disabled={busy} />
          <Input label="Postal code" value={fields.postalCode} onChange={(event) => set("postalCode", event.target.value)} required maxLength={20} disabled={busy} />
        </div>
        <Input label="Capacity" type="number" min={1} step={1} value={fields.capacity} onChange={(event) => set("capacity", event.target.value)} required disabled={busy} hint="Must be at least the total seats across all sections." />

        <h2 className="organizer-subheading">Sections</h2>
        {fields.sections.map((section, index) => (
          <fieldset key={index} className="venue-section" disabled={busy}>
            <legend>Section {index + 1}</legend>
            <div className="organizer-form__grid">
              <Input label="Name" value={section.name} onChange={(event) => setSection(index, { name: event.target.value })} required maxLength={50} />
              <label className="organizer-form__field">Category
                <select value={section.seatCategory} onChange={(event) => setSection(index, { seatCategory: event.target.value as SeatCategory })}>
                  <option value="STANDARD">Standard</option><option value="PREMIUM">Premium</option><option value="VIP">VIP</option>
                </select>
              </label>
              <Input label="Rows" type="number" min={1} step={1} value={section.rows} onChange={(event) => setSection(index, { rows: event.target.value })} required />
              <Input label="Seats per row" type="number" min={1} step={1} value={section.seatsPerRow} onChange={(event) => setSection(index, { seatsPerRow: event.target.value })} required />
              <Input label="Price" type="number" min={0} step="0.01" value={section.price} onChange={(event) => setSection(index, { price: event.target.value })} required />
            </div>
            {fields.sections.length > 1 ? <Button type="button" size="small" variant="secondary" onClick={() => set("sections", fields.sections.filter((_, i) => i !== index))}>Remove section</Button> : null}
          </fieldset>
        ))}
        <div><Button type="button" size="small" variant="secondary" disabled={busy} onClick={() => set("sections", [...fields.sections, blankSection()])}>Add section</Button></div>

        {problem ? <p className="auth-form__feedback" role="alert">{problem}</p> : null}
        <div className="organizer-actions">
          <Button type="submit" loading={busy}>{editing ? "Save venue" : "Create venue"}</Button>
          <Button href="/admin/venues" variant="secondary" disabled={busy}>Cancel</Button>
        </div>
      </form>
    </section>
  );
}
