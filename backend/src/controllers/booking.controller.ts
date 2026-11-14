import type { RequestHandler } from "express";
import { cancelBooking } from "../services/booking-cancellation.service.js";
import {
  createCheckout,
  getBookingById,
  getBookingStatus,
  getMyBookings,
  verifyBookingPayment,
  verifyCheckoutSessionPayment,
} from "../services/checkout.service.js";
import { sendSuccess } from "../utils/api-response.js";
import { parseInput } from "../utils/validation.js";
import {
  bookingIdParamsSchema,
  createCheckoutSchema,
  myBookingsQuerySchema,
  verifyCheckoutQuerySchema,
} from "../validators/booking.validator.js";

export const checkoutController: RequestHandler = async (request, response) => {
  const userId = request.user?.id;
  if (!userId) {
    return response.status(401).json({ success: false, message: "Authentication required" });
  }

  const payload = parseInput(createCheckoutSchema, request.body);
  const result = await createCheckout(userId, payload);
  return sendSuccess(response, result, "Checkout session created", 201);
};

export const getBookingController: RequestHandler = async (request, response) => {
  const { bookingId } = parseInput(bookingIdParamsSchema, request.params);
  const user = request.user;
  if (!user) {
    return response.status(401).json({ success: false, message: "Authentication required" });
  }

  const booking = await getBookingById(bookingId, user.id, user.role);
  return sendSuccess(response, booking, "Booking retrieved successfully");
};

export const getBookingStatusController: RequestHandler = async (request, response) => {
  const { bookingId } = parseInput(bookingIdParamsSchema, request.params);
  const user = request.user;
  if (!user) {
    return response.status(401).json({ success: false, message: "Authentication required" });
  }

  const status = await getBookingStatus(bookingId, user.id, user.role);
  return sendSuccess(response, status, "Booking status retrieved successfully");
};

export const verifyBookingPaymentController: RequestHandler = async (request, response) => {
  const { bookingId } = parseInput(bookingIdParamsSchema, request.params);
  const user = request.user;
  if (!user) {
    return response.status(401).json({ success: false, message: "Authentication required" });
  }

  const status = await verifyBookingPayment(bookingId, user.id, user.role);
  return sendSuccess(response, status, "Booking payment verified");
};

export const verifyCheckoutSessionController: RequestHandler = async (request, response) => {
  const { session_id: sessionId } = parseInput(verifyCheckoutQuerySchema, request.query);
  const user = request.user;
  if (!user) {
    return response.status(401).json({ success: false, message: "Authentication required" });
  }

  const status = await verifyCheckoutSessionPayment(sessionId, user.id, user.role);
  return sendSuccess(response, status, "Booking payment verified");
};

export const getMyBookingsController: RequestHandler = async (request, response) => {
  const userId = request.user?.id;
  if (!userId) {
    return response.status(401).json({ success: false, message: "Authentication required" });
  }

  const query = parseInput(myBookingsQuerySchema, request.query);
  const result = await getMyBookings(userId, query);
  return sendSuccess(response, result, "Bookings retrieved successfully");
};

export const cancelBookingController: RequestHandler = async (request, response) => {
  const { bookingId } = parseInput(bookingIdParamsSchema, request.params);
  const userId = request.user?.id;
  if (!userId) {
    return response.status(401).json({ success: false, message: "Authentication required" });
  }

  const result = await cancelBooking(bookingId, userId);
  return sendSuccess(response, result, "Booking cancelled");
};
