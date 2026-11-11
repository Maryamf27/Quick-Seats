import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";
import {
  createVenueController,
  deleteVenueController,
  getVenueController,
  listVenuesController,
  updateVenueController,
} from "../controllers/venue.controller.js";

export const venueRouter = Router();

venueRouter
  .route("/venues")
  .post(authenticate, authorize("ADMIN"), createVenueController)
  .get(listVenuesController);

venueRouter
  .route("/venues/:id")
  .get(getVenueController)
  .put(authenticate, authorize("ADMIN"), updateVenueController)
  .delete(authenticate, authorize("ADMIN"), deleteVenueController);
