import { api } from "../client";
import type { ApiRequestOptions, QueryValue } from "../client";
import type { Pagination, Venue, VenueAddress, VenueSection } from "../types";

export interface ListVenuesQuery extends Record<string, QueryValue> {
  page?: number;
  limit?: number;
  search?: string;
  city?: string;
  sortBy?: "name" | "city" | "createdAt";
  order?: "asc" | "desc";
}

export interface VenueListResult {
  venues: Venue[];
  pagination: Pagination;
}

export interface CreateVenueInput {
  name: string;
  description?: string;
  address: VenueAddress;
  capacity: number;
  sections: VenueSection[];
}

export type UpdateVenueInput = Partial<CreateVenueInput>;

export const venuesApi = {
  list(
    query: ListVenuesQuery = {},
    options?: ApiRequestOptions,
  ): Promise<VenueListResult> {
    return api.get("/venues", { ...options, query });
  },
  get(id: string, options?: ApiRequestOptions): Promise<Venue> {
    return api.get(`/venues/${encodeURIComponent(id)}`, options);
  },
  create(
    input: CreateVenueInput,
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<Venue> {
    return api.post("/venues", input, { ...options, accessToken });
  },
  update(
    id: string,
    input: UpdateVenueInput,
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<Venue> {
    return api.put(`/venues/${encodeURIComponent(id)}`, input, {
      ...options,
      accessToken,
    });
  },
  delete(
    id: string,
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<null> {
    return api.delete(`/venues/${encodeURIComponent(id)}`, undefined, {
      ...options,
      accessToken,
    });
  },
};
