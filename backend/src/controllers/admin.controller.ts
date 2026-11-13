import type { RequestHandler } from "express";
import {
  getAdminAnalytics,
  getAdminOverview,
  getUserDetail,
  listAllBookings,
  listAllEvents,
  listOrganizers,
  listUsers,
  updateUser,
} from "../services/admin.service.js";
import { AppError } from "../utils/app-error.js";
import { sendSuccess } from "../utils/api-response.js";
import { parseInput } from "../utils/validation.js";
import { adminUserIdParamsSchema } from "../validators/admin.validator.js";

function adminId(request: Parameters<RequestHandler>[0]): string {
  if (!request.user) throw new AppError("Authentication required", 401);
  return request.user.id;
}

export const adminOverviewController: RequestHandler = async (_request, response) =>
  sendSuccess(response, await getAdminOverview(), "Admin overview retrieved");

export const adminListUsersController: RequestHandler = async (request, response) =>
  sendSuccess(response, await listUsers(request.query), "Users retrieved");

export const adminGetUserController: RequestHandler = async (request, response) => {
  const { userId } = parseInput(adminUserIdParamsSchema, request.params);
  return sendSuccess(response, await getUserDetail(userId), "User retrieved");
};

export const adminUpdateUserController: RequestHandler = async (request, response) => {
  const { userId } = parseInput(adminUserIdParamsSchema, request.params);
  return sendSuccess(
    response,
    await updateUser(userId, adminId(request), request.body),
    "User updated",
  );
};

export const adminListOrganizersController: RequestHandler = async (request, response) =>
  sendSuccess(response, await listOrganizers(request.query), "Organizers retrieved");

export const adminListEventsController: RequestHandler = async (request, response) =>
  sendSuccess(response, await listAllEvents(request.query), "Events retrieved");

export const adminListBookingsController: RequestHandler = async (request, response) =>
  sendSuccess(response, await listAllBookings(request.query), "Bookings retrieved");

export const adminAnalyticsController: RequestHandler = async (request, response) =>
  sendSuccess(response, await getAdminAnalytics(request.query), "Analytics retrieved");
