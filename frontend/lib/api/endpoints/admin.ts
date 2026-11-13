import { api } from "../client";
import type { ApiRequestOptions, QueryValue } from "../client";
import type {
  AdminAnalyticsResult,
  AdminBookingRow,
  AdminEventRow,
  AdminOrganizer,
  AdminOverviewResult,
  AdminUser,
  BookingStatus,
  EventStatus,
  Pagination,
  PaymentStatus,
  UserRole,
} from "../types";

interface Paged extends Record<string, QueryValue> {
  page?: number;
  limit?: number;
  search?: string;
}

export interface AdminUserQuery extends Paged {
  role?: UserRole;
  suspended?: boolean;
}
export interface AdminEventQuery extends Paged {
  status?: EventStatus;
}
export interface AdminBookingQuery extends Paged {
  status?: BookingStatus;
  paymentStatus?: PaymentStatus;
}
export interface AdminAnalyticsQuery extends Record<string, QueryValue> {
  from?: string;
  to?: string;
}

export const adminApi = {
  overview(token: string, options?: ApiRequestOptions): Promise<AdminOverviewResult> {
    return api.get("/admin/overview", { ...options, accessToken: token });
  },
  users(query: AdminUserQuery, token: string, options?: ApiRequestOptions): Promise<{ users: AdminUser[]; pagination: Pagination }> {
    return api.get("/admin/users", { ...options, query, accessToken: token });
  },
  updateUser(id: string, changes: { role?: "USER" | "ORGANIZER"; isSuspended?: boolean }, token: string, options?: ApiRequestOptions): Promise<AdminUser> {
    return api.patch(`/admin/users/${encodeURIComponent(id)}`, changes, { ...options, accessToken: token });
  },
  organizers(query: Paged, token: string, options?: ApiRequestOptions): Promise<{ organizers: AdminOrganizer[]; pagination: Pagination }> {
    return api.get("/admin/organizers", { ...options, query, accessToken: token });
  },
  events(query: AdminEventQuery, token: string, options?: ApiRequestOptions): Promise<{ events: AdminEventRow[]; pagination: Pagination }> {
    return api.get("/admin/events", { ...options, query, accessToken: token });
  },
  unpublishEvent(id: string, token: string, options?: ApiRequestOptions): Promise<{ id: string; status: EventStatus }> {
    return api.post(`/admin/events/${encodeURIComponent(id)}/unpublish`, undefined, { ...options, accessToken: token });
  },
  cancelEvent(id: string, token: string, options?: ApiRequestOptions): Promise<{ id: string; status: EventStatus; cancelledBookings: number }> {
    return api.post(`/admin/events/${encodeURIComponent(id)}/cancel`, undefined, { ...options, accessToken: token });
  },
  bookings(query: AdminBookingQuery, token: string, options?: ApiRequestOptions): Promise<{ bookings: AdminBookingRow[]; pagination: Pagination }> {
    return api.get("/admin/bookings", { ...options, query, accessToken: token });
  },
  analytics(query: AdminAnalyticsQuery, token: string, options?: ApiRequestOptions): Promise<AdminAnalyticsResult> {
    return api.get("/admin/analytics", { ...options, query, accessToken: token });
  },
};
