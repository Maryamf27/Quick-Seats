import { api } from "../client";
import type { ApiRequestOptions, QueryValue } from "../client";
import type { OrganizerApplication, OrganizerApplicationStatus, Pagination } from "../types";

export interface OrganizerApplicationInput { businessName: string; description: string; }
export interface OrganizerApplicationList extends Record<string, QueryValue> { page?: number; limit?: number; status?: OrganizerApplicationStatus; }

export const organizerApplicationsApi = {
  mine(token: string, options?: ApiRequestOptions): Promise<OrganizerApplication | null> {
    return api.get("/organizer-applications/me", { ...options, accessToken: token });
  },
  submit(input: OrganizerApplicationInput, token: string, options?: ApiRequestOptions): Promise<OrganizerApplication> {
    return api.post("/organizer-applications", input, { ...options, accessToken: token });
  },
  list(query: OrganizerApplicationList, token: string, options?: ApiRequestOptions): Promise<{ applications: OrganizerApplication[]; pagination: Pagination }> {
    return api.get("/admin/organizer-applications", { ...options, query, accessToken: token });
  },
  decide(id: string, decision: "APPROVED" | "REJECTED", token: string, options?: ApiRequestOptions): Promise<OrganizerApplication> {
    return api.post(`/admin/organizer-applications/${encodeURIComponent(id)}/decision`, { decision }, { ...options, accessToken: token });
  },
};
