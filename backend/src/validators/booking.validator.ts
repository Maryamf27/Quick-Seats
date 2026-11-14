import { z } from "zod";
import { eventIdParamsSchema, objectIdSchema, paginationSchema } from "./common.validator.js";

export const createCheckoutSchema = z
  .object({
    eventId: objectIdSchema,
    holdId: z.string().trim().min(1).max(255),
  })
  .strict();

export const bookingIdParamsSchema = z.object({ bookingId: objectIdSchema }).strict();

export const verifyCheckoutQuerySchema = z
  .object({
    session_id: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .regex(/^cs_[A-Za-z0-9_]+$/, "Invalid Stripe checkout session id"),
  })
  .strict();

export const myBookingsQuerySchema = z
  .object(paginationSchema)
  .strict();

export const checkoutEventParamsSchema = eventIdParamsSchema;
