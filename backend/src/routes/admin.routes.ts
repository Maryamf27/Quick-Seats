import { Router } from "express";
import {
  adminAnalyticsController,
  adminCancelEventController,
  adminGetUserController,
  adminListBookingsController,
  adminListEventsController,
  adminListOrganizersController,
  adminListUsersController,
  adminOverviewController,
  adminUnpublishEventController,
  adminUpdateUserController,
} from "../controllers/admin.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

export const adminRouter = Router();

adminRouter.use("/admin", authenticate, authorize("ADMIN"));
adminRouter.get("/admin/overview", adminOverviewController);
adminRouter.get("/admin/users", adminListUsersController);
adminRouter.get("/admin/users/:userId", adminGetUserController);
adminRouter.patch("/admin/users/:userId", adminUpdateUserController);
adminRouter.get("/admin/organizers", adminListOrganizersController);
adminRouter.get("/admin/events", adminListEventsController);
adminRouter.get("/admin/bookings", adminListBookingsController);
adminRouter.get("/admin/analytics", adminAnalyticsController);
adminRouter.post("/admin/events/:eventId/unpublish", adminUnpublishEventController);
adminRouter.post("/admin/events/:eventId/cancel", adminCancelEventController);
