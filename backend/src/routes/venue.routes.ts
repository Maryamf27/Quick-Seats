import { Router } from "express";
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
  .post(createVenueController)
  .get(listVenuesController);

venueRouter
  .route("/venues/:id")
  .get(getVenueController)
  .put(updateVenueController)
  .delete(deleteVenueController);
