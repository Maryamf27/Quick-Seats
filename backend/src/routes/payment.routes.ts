import { Router } from "express";
import { stripeWebhookController } from "../controllers/payment.controller.js";

export const paymentRouter = Router();

paymentRouter.post("/webhook", stripeWebhookController);
