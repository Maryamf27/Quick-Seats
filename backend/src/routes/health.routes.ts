import { Router } from "express";
import { getHealth, getReadiness } from "../controllers/health.controller.js";

export const healthRouter = Router();

healthRouter.get("/health", getHealth);
healthRouter.get("/health/ready", getReadiness);
