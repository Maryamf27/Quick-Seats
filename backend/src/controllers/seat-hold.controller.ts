import type { RequestHandler } from "express";
import { holdSeats, releaseHold } from "../services/seat-hold.service.js";
import { clearExpiredSeatHolds } from "../services/seat-expiration.service.js";
import { sendSuccess } from "../utils/api-response.js";
import { parseInput } from "../utils/validation.js";
import { eventIdParamsSchema } from "../validators/common.validator.js";
import { holdSeatsSchema, releaseHoldSchema } from "../validators/seat-hold.validator.js";

export const holdSeatsController: RequestHandler = async (request, response) => {
  const { eventId } = parseInput(eventIdParamsSchema, request.params);
  const userId = request.user?.id;

  if (!userId) {
    return response.status(401).json({ success: false, message: "Authentication required" });
  }

  const payload = parseInput(holdSeatsSchema, request.body);
  const result = await holdSeats(eventId, userId, payload);
  return sendSuccess(response, result, "Seats held successfully", 200);
};

export const releaseHoldController: RequestHandler = async (request, response) => {
  const { eventId } = parseInput(eventIdParamsSchema, request.params);
  const userId = request.user?.id;

  if (!userId) {
    return response.status(401).json({ success: false, message: "Authentication required" });
  }

  const payload = parseInput(releaseHoldSchema, request.body);
  const result = await releaseHold(eventId, userId, payload);
  return sendSuccess(response, result, "Seat hold released successfully", 200);
};

export const cleanupExpiredHoldsController: RequestHandler = async (_request, response) => {
  const processed = await clearExpiredSeatHolds();
  return sendSuccess(
    response,
    { processed },
    "Expired seat holds cleaned successfully",
    200,
  );
};
