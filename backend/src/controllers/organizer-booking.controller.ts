import type { RequestHandler } from "express";
import { listOrganizerBookings } from "../services/organizer-booking.service.js";
import { AppError } from "../utils/app-error.js";
import { sendSuccess } from "../utils/api-response.js";

export const listOrganizerBookingsController: RequestHandler = async (request, response) => {
  if (!request.user) throw new AppError("Authentication required", 401);
  return sendSuccess(
    response,
    await listOrganizerBookings(request.user.id, request.query),
    "Organizer bookings retrieved",
  );
};
