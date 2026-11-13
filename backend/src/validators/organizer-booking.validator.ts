import { z } from "zod";
import { BOOKING_STATUSES } from "../types/domain.js";
import { objectIdSchema, paginationSchema } from "./common.validator.js";

export const organizerBookingsQuerySchema = z
  .object({
    ...paginationSchema,
    eventId: objectIdSchema.optional(),
    status: z.enum(BOOKING_STATUSES).optional(),
  })
  .strict();
