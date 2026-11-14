import { Router } from "express";
import {
  cancelBookingController,
  checkoutController,
  getBookingController,
  getBookingStatusController,
  getMyBookingsController,
  verifyBookingPaymentController,
  verifyCheckoutSessionController,
} from "../controllers/booking.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";
import { checkoutRateLimit } from "../middlewares/rate-limit.middleware.js";

export const bookingRouter = Router();

bookingRouter.use(authenticate);
bookingRouter.post("/checkout", authorize("USER", "ADMIN"), checkoutRateLimit, checkoutController);
bookingRouter.get("/my", getMyBookingsController);
bookingRouter.get("/verify-checkout", verifyCheckoutSessionController);
bookingRouter.post("/:bookingId/cancel", cancelBookingController);
bookingRouter.get("/:bookingId/verify-payment", verifyBookingPaymentController);
bookingRouter.get("/:bookingId/status", getBookingStatusController);
bookingRouter.get("/:bookingId", getBookingController);
