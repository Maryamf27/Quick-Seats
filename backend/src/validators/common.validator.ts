import { z } from "zod";

export const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Must be a valid MongoDB ObjectId");

export const idParamsSchema = z.object({ id: objectIdSchema }).strict();
export const eventIdParamsSchema = z.object({ eventId: objectIdSchema }).strict();

export const paginationSchema = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const searchSchema = z.string().trim().max(100).optional();
