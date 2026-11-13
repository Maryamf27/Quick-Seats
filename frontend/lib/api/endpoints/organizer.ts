import { api } from "../client";
import type { ApiRequestOptions, QueryValue } from "../client";
import type {
  BookingStatus,
  OrganizerBookingRow,
  Pagination,
  OrganizerReport,
  OrganizerReportQueued,
  OrganizerSalesSummary,
} from "../types";

export interface ReportRange extends Record<string, QueryValue> {
  from?: string;
  to?: string;
}

export interface OrganizerBookingsQuery extends Record<string, QueryValue> {
  page?: number;
  limit?: number;
  eventId?: string;
  status?: BookingStatus;
}

export const organizerApi = {
  bookings(
    query: OrganizerBookingsQuery,
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<{ bookings: OrganizerBookingRow[]; pagination: Pagination }> {
    return api.get("/organizer/bookings", { ...options, accessToken, query });
  },
  salesSummary(
    range: ReportRange,
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<OrganizerSalesSummary> {
    return api.get("/organizer/reports/summary", {
      ...options,
      accessToken,
      query: range,
    });
  },
  createReport(
    range: ReportRange,
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<OrganizerReportQueued> {
    return api.post("/organizer/reports", range, { ...options, accessToken });
  },
  getReport(
    reportId: string,
    accessToken: string,
    options?: ApiRequestOptions,
  ): Promise<OrganizerReport> {
    return api.get(`/organizer/reports/${encodeURIComponent(reportId)}`, {
      ...options,
      accessToken,
    });
  },
};
