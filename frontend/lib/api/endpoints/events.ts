import { api } from "../client";
import type { ApiRequestOptions, QueryValue } from "../client";
import type {
  EventListResult,
  EventRecord,
  OrganizerEventListResult,
  SeatGenerationResult,
  SeatHoldResult,
  SeatMapResult,
  SeatReleaseResult,
} from "../types";

export interface ListEventsQuery extends Record<string, QueryValue> {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  city?: string;
  from?: string;
  to?: string;
  sortBy?: "startDate" | "createdAt";
  order?: "asc" | "desc";
}

export interface CreateEventInput {
  title: string;
  description: string;
  category: string;
  venueId: string;
  startDate: string;
  endDate: string;
  posterUrl?: string;
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  status?: EventRecord["status"];
  posterUrl?: string | null;
}

export interface SeatMapQuery extends Record<string, QueryValue> {
  page?: number;
  limit?: number;
  section?: string;
  category?: "STANDARD" | "PREMIUM" | "VIP";
}

export const eventsApi = {
  organizerMine(query: { page?: number; limit?: number }, accessToken: string, options?: ApiRequestOptions): Promise<OrganizerEventListResult> {
    return api.get("/organizer/events", { ...options, accessToken, query });
  },
  organizerGet(eventId: string, accessToken: string, options?: ApiRequestOptions): Promise<EventRecord> {
    return api.get(`/organizer/events/${encodeURIComponent(eventId)}`, { ...options, accessToken });
  },
  list(
    query: ListEventsQuery = {},
    options?: ApiRequestOptions,
  ): Promise<EventListResult> {
    return api.get("/events", { ...options, query });
  },
  get(eventId: string, options?: ApiRequestOptions): Promise<EventRecord> {
    return api.get(`/events/${encodeURIComponent(eventId)}`, options);
  },
  create(
    input: CreateEventInput,
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<EventRecord> {
    return api.post("/events", input, { ...options, accessToken });
  },
  update(
    eventId: string,
    input: UpdateEventInput,
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<EventRecord> {
    return api.put(`/events/${encodeURIComponent(eventId)}`, input, {
      ...options,
      accessToken,
    });
  },
  delete(
    eventId: string,
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<null> {
    return api.delete(`/events/${encodeURIComponent(eventId)}`, undefined, {
      ...options,
      accessToken,
    });
  },
  generateSeats(
    eventId: string,
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<SeatGenerationResult> {
    return api.post(
      `/events/${encodeURIComponent(eventId)}/generate-seats`,
      undefined,
      { ...options, accessToken },
    );
  },
  seatMap(
    eventId: string,
    query: SeatMapQuery = {},
    options?: ApiRequestOptions,
  ): Promise<SeatMapResult> {
    return api.get(`/events/${encodeURIComponent(eventId)}/seats`, {
      ...options,
      query,
    });
  },
  holdSeats(
    eventId: string,
    seatIds: string[],
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<SeatHoldResult> {
    return api.post(
      `/events/${encodeURIComponent(eventId)}/seats/hold`,
      { seatIds },
      { ...options, accessToken },
    );
  },
  releaseHold(
    eventId: string,
    holdId: string,
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<SeatReleaseResult> {
    return api.post(
      `/events/${encodeURIComponent(eventId)}/seats/release`,
      { holdId },
      { ...options, accessToken },
    );
  },
};
