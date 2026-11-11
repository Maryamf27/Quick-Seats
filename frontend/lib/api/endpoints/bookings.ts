import { api } from "../client";
import type { ApiRequestOptions, QueryValue } from "../client";
import type {
  BookingDetail,
  BookingListResult,
  BookingStatusResult,
  CheckoutResult,
} from "../types";

export interface CheckoutInput {
  eventId: string;
  holdId: string;
}

export interface ListBookingsQuery extends Record<string, QueryValue> {
  page?: number;
  limit?: number;
}

export const bookingsApi = {
  checkout(
    input: CheckoutInput,
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<CheckoutResult> {
    return api.post("/bookings/checkout", input, { ...options, accessToken });
  },
  mine(
    query: ListBookingsQuery = {},
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<BookingListResult> {
    return api.get("/bookings/my", {
      ...options,
      accessToken,
      query,
    });
  },
  get(
    bookingId: string,
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<BookingDetail> {
    return api.get(`/bookings/${encodeURIComponent(bookingId)}`, {
      ...options,
      accessToken,
    });
  },
  status(
    bookingId: string,
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<BookingStatusResult> {
    return api.get(`/bookings/${encodeURIComponent(bookingId)}/status`, {
      ...options,
      accessToken,
    });
  },
};
