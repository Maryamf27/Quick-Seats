import { Router } from "express";
import {
  createEventController,
  deleteEventController,
  generateEventSeatsController,
  getEventController,
  getEventSeatMapController,
  listEventsController,
  updateEventController,
} from "../controllers/event.controller.js";
import {
  holdSeatsController,
  releaseHoldController,
} from "../controllers/seat-hold.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";
import {
  eventDetailRateLimit,
  eventListRateLimit,
  seatHoldRateLimit,
} from "../middlewares/rate-limit.middleware.js";

export const eventRouter = Router();

eventRouter
  .route("/events")
  .post(authenticate, authorize("ORGANIZER", "ADMIN"), createEventController)
  .get(eventListRateLimit, listEventsController);
eventRouter.post(
  "/events/:eventId/generate-seats",
  authenticate,
  authorize("ORGANIZER", "ADMIN"),
  generateEventSeatsController,
);
eventRouter.get("/events/:eventId/seats", eventDetailRateLimit, getEventSeatMapController);
eventRouter.post(
  "/events/:eventId/seats/hold",
  authenticate,
  seatHoldRateLimit,
  holdSeatsController,
);
eventRouter.post("/events/:eventId/seats/release", authenticate, releaseHoldController);
eventRouter
  .route("/events/:eventId")
  .get(eventDetailRateLimit, getEventController)
  .put(authenticate, authorize("ORGANIZER", "ADMIN"), updateEventController)
  .delete(authenticate, authorize("ORGANIZER", "ADMIN"), deleteEventController);
