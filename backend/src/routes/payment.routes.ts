import express, { Router } from "express";
import { stripeWebhookController } from "../controllers/payment.controller.js";

export const paymentRouter = Router();

paymentRouter.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookController,
);