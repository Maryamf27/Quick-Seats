import { api } from "../client";
import type { ApiRequestOptions, QueryValue } from "../client";
import type {
  BookingDetail,
  BookingListResult,
  BookingStatusResult,
  CancelBookingResult,
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
  cancel(
    bookingId: string,
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<CancelBookingResult> {
    return api.post(`/bookings/${encodeURIComponent(bookingId)}/cancel`, undefined, {
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
  verifyPayment(
    bookingId: string,
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<BookingStatusResult> {
    return api.get(`/bookings/${encodeURIComponent(bookingId)}/verify-payment`, {
      ...options,
      accessToken,
    });
  },
  verifyCheckoutSession(
    sessionId: string,
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<BookingStatusResult> {
    return api.get("/bookings/verify-checkout", {
      ...options,
      accessToken,
      query: { session_id: sessionId },
    });
  },
};
