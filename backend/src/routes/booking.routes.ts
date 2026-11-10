import { Router } from "express";
import {
  checkoutController,
  getBookingController,
  getBookingStatusController,
  getMyBookingsController,
} from "../controllers/booking.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

export const bookingRouter = Router();

bookingRouter.use(authenticate);
bookingRouter.post("/checkout", checkoutController);
bookingRouter.get("/my", getMyBookingsController);
bookingRouter.get("/:bookingId/status", getBookingStatusController);
bookingRouter.get("/:bookingId", getBookingController);
