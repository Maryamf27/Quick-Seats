import { Router } from "express";
import { cleanupExpiredHoldsController } from "../controllers/seat-hold.controller.js";
import { requireInternalSecret } from "../middlewares/internal-auth.middleware.js";

export const seatHoldRouter = Router();

seatHoldRouter.post(
  "/internal/seat-holds/cleanup",
  requireInternalSecret,
  cleanupExpiredHoldsController,
);
