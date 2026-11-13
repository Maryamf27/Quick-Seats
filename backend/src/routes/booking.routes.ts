import { Router } from "express";
import {
  cancelBookingController,
  checkoutController,
  getBookingController,
  getBookingStatusController,
  getMyBookingsController,
} from "../controllers/booking.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { checkoutRateLimit } from "../middlewares/rate-limit.middleware.js";

export const bookingRouter = Router();

bookingRouter.use(authenticate);
bookingRouter.post("/checkout", checkoutRateLimit, checkoutController);
bookingRouter.get("/my", getMyBookingsController);
bookingRouter.post("/:bookingId/cancel", cancelBookingController);
bookingRouter.get("/:bookingId/status", getBookingStatusController);
bookingRouter.get("/:bookingId", getBookingController);
