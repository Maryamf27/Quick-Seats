import { z } from "zod";
import { EVENT_STATUSES } from "../types/domain.js";
import {
  eventIdParamsSchema,
  objectIdSchema,
  paginationSchema,
} from "./common.validator.js";

const dateSchema = z.coerce.date().refine((date) => !Number.isNaN(date.getTime()), {
  message: "Must be a valid date",
});

export const createEventSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(10000),
    category: z.string().trim().min(1).max(100),
    venueId: objectIdSchema,
    organizerId: objectIdSchema,
    startDate: dateSchema,
    endDate: dateSchema,
    posterUrl: z.string().url().max(2048).optional(),
  })
  .strict()
  .refine((event) => event.endDate > event.startDate, {
    message: "End date must be after start date",
    path: ["endDate"],
  });

export const updateEventSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(10000).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    status: z.enum(EVENT_STATUSES).optional(),
    posterUrl: z.string().url().max(2048).nullable().optional(),
  })
  .strict()
  .refine((event) => Object.keys(event).length > 0, {
    message: "At least one field must be provided",
  });

export const listEventsQuerySchema = z
  .object({
    ...paginationSchema,
    search: z.string().trim().max(100).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    sortBy: z.enum(["startDate", "createdAt"]).default("startDate"),
    order: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict()
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: "from must be before or equal to to",
    path: ["from"],
  });

export const eventIdOnlyParamsSchema = eventIdParamsSchema;

export const seatMapQuerySchema = z
  .object({
    ...paginationSchema,
    section: z.string().trim().min(1).max(50).optional(),
    category: z.enum(["STANDARD", "PREMIUM", "VIP"]).optional(),
  })
  .strict();
