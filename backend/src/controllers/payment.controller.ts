import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { stripe } from "../config/stripe.js";
import { processStripeEvent } from "../services/webhook.service.js";

export const stripeWebhookController: RequestHandler = async (request, response) => {
  const signature = request.headers["stripe-signature"];
  if (typeof signature !== "string" || !Buffer.isBuffer(request.body)) {
    return response.status(400).json({ success: false, message: "Invalid Stripe webhook request" });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      request.body,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return response.status(400).json({ success: false, message: "Invalid Stripe webhook signature" });
  }

  await processStripeEvent(event);
  return response.status(200).json({ received: true });
};
