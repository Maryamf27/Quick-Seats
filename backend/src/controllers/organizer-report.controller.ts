import type { RequestHandler } from "express";
import {
  buildOrganizerSalesSummary,
  getOrganizerReport,
  normalizeReportRange,
  queueOrganizerReport,
} from "../services/organizer-report.service.js";
import { AppError } from "../utils/app-error.js";
import { sendSuccess } from "../utils/api-response.js";
import { parseInput } from "../utils/validation.js";
import {
  reportIdParamsSchema,
  reportRangeSchema,
} from "../validators/organizer-report.validator.js";

function getOrganizerId(request: Parameters<RequestHandler>[0]): string {
  if (!request.user) {
    throw new AppError("Authentication required", 401);
  }
  return request.user.id;
}

export const organizerSalesSummaryController: RequestHandler = async (
  request,
  response,
) => {
  const range = parseInput(reportRangeSchema, request.query);
  const normalized = normalizeReportRange(range.from, range.to);
  const summary = await buildOrganizerSalesSummary(
    getOrganizerId(request),
    normalized.from,
    normalized.to,
  );
  return sendSuccess(response, summary, "Organizer sales summary retrieved");
};

export const createOrganizerReportController: RequestHandler = async (
  request,
  response,
) => {
  const range = parseInput(reportRangeSchema, request.body);
  const report = await queueOrganizerReport(
    getOrganizerId(request),
    range.from,
    range.to,
  );
  return sendSuccess(
    response,
    { reportId: report._id.toString(), status: report.status },
    "Organizer report queued",
    202,
  );
};

export const getOrganizerReportController: RequestHandler = async (
  request,
  response,
) => {
  const { reportId } = parseInput(reportIdParamsSchema, request.params);
  const report = await getOrganizerReport(reportId, getOrganizerId(request));
  return sendSuccess(response, report, "Organizer report retrieved");
};
