import { Router } from "express";
import { createOrganizerApplicationController, decideOrganizerApplicationController, getMyOrganizerApplicationController, listOrganizerApplicationsController } from "../controllers/organizer-application.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

export const organizerApplicationRouter = Router();
organizerApplicationRouter.get("/organizer-applications/me", authenticate, getMyOrganizerApplicationController);
organizerApplicationRouter.post("/organizer-applications", authenticate, createOrganizerApplicationController);
organizerApplicationRouter.get("/admin/organizer-applications", authenticate, authorize("ADMIN"), listOrganizerApplicationsController);
organizerApplicationRouter.post("/admin/organizer-applications/:applicationId/decision", authenticate, authorize("ADMIN"), decideOrganizerApplicationController);
