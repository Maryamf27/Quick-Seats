import { api } from "../client";
import type { ApiRequestOptions, QueryValue } from "../client";
import type {
  OrganizerReport,
  OrganizerReportQueued,
  OrganizerSalesSummary,
} from "../types";

export interface ReportRange extends Record<string, QueryValue> {
  from?: string;
  to?: string;
}

export const organizerApi = {
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
