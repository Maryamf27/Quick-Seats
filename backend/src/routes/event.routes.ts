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
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

export const eventRouter = Router();

eventRouter
  .route("/events")
  .post(authenticate, authorize("ORGANIZER", "ADMIN"), createEventController)
  .get(listEventsController);
eventRouter.post(
  "/events/:eventId/generate-seats",
  authenticate,
  authorize("ORGANIZER", "ADMIN"),
  generateEventSeatsController,
);
eventRouter.get("/events/:eventId/seats", getEventSeatMapController);
eventRouter
  .route("/events/:eventId")
  .get(getEventController)
  .put(authenticate, authorize("ORGANIZER", "ADMIN"), updateEventController)
  .delete(authenticate, authorize("ORGANIZER", "ADMIN"), deleteEventController);
