import { z } from "zod";
import { paginationSchema } from "./common.validator.js";

export const createOrganizerApplicationSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  description: z.string().trim().min(20).max(2000),
}).strict();

export const decideOrganizerApplicationSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
}).strict();

export const organizerApplicationsQuerySchema = z.object({
  ...paginationSchema,
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING"),
}).strict();

export const organizerApplicationIdParamsSchema = z.object({
  applicationId: z.string().regex(/^[a-f\d]{24}$/i),
}).strict();
