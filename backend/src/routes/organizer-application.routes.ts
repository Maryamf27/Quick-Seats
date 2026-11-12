import { Router } from "express";
import { createOrganizerApplicationController, decideOrganizerApplicationController, getMyOrganizerApplicationController, listOrganizerApplicationsController } from "../controllers/organizer-application.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

export const organizerApplicationRouter = Router();
organizerApplicationRouter.use(authenticate);
organizerApplicationRouter.get("/organizer-applications/me", getMyOrganizerApplicationController);
organizerApplicationRouter.post("/organizer-applications", createOrganizerApplicationController);
organizerApplicationRouter.get("/admin/organizer-applications", authorize("ADMIN"), listOrganizerApplicationsController);
organizerApplicationRouter.post("/admin/organizer-applications/:applicationId/decision", authorize("ADMIN"), decideOrganizerApplicationController);
