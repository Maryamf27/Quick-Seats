import { Router } from "express";
import {
  createOrganizerReportController,
  getOrganizerReportController,
  organizerSalesSummaryController,
} from "../controllers/organizer-report.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

export const organizerReportRouter = Router();

organizerReportRouter.use(authenticate, authorize("ORGANIZER"));
organizerReportRouter.get("/organizer/reports/summary", organizerSalesSummaryController);
organizerReportRouter.post("/organizer/reports", createOrganizerReportController);
organizerReportRouter.get("/organizer/reports/:reportId", getOrganizerReportController);
