import { Router } from "express";
import { listOrganizerBookingsController } from "../controllers/organizer-booking.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

export const organizerBookingRouter = Router();

organizerBookingRouter.get(
  "/organizer/bookings",
  authenticate,
  authorize("ORGANIZER"),
  listOrganizerBookingsController,
);
