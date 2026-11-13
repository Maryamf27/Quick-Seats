import { z } from "zod";
import {
  BOOKING_STATUSES,
  EVENT_STATUSES,
  PAYMENT_STATUSES,
} from "../types/domain.js";
import { objectIdSchema, paginationSchema } from "./common.validator.js";

export const adminUserIdParamsSchema = z.object({ userId: objectIdSchema }).strict();

export const adminListUsersQuerySchema = z
  .object({
    ...paginationSchema,
    search: z.string().trim().max(100).optional(),
    role: z.enum(["USER", "ORGANIZER", "ADMIN"]).optional(),
    suspended: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
  })
  .strict();

export const adminUpdateUserSchema = z
  .object({
    role: z.enum(["USER", "ORGANIZER"]).optional(),
    isSuspended: z.boolean().optional(),
  })
  .strict()
  .refine((payload) => payload.role !== undefined || payload.isSuspended !== undefined, {
    message: "Provide role or isSuspended",
  });

export const adminListOrganizersQuerySchema = z
  .object({
    ...paginationSchema,
    search: z.string().trim().max(100).optional(),
  })
  .strict();

export const adminListEventsQuerySchema = z
  .object({
    ...paginationSchema,
    search: z.string().trim().max(100).optional(),
    status: z.enum(EVENT_STATUSES).optional(),
    organizerId: objectIdSchema.optional(),
  })
  .strict();

export const adminListBookingsQuerySchema = z
  .object({
    ...paginationSchema,
    status: z.enum(BOOKING_STATUSES).optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
    eventId: objectIdSchema.optional(),
    userId: objectIdSchema.optional(),
  })
  .strict();

export const adminAnalyticsQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: "from must be before to",
    path: ["from"],
  });
