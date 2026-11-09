import { z } from "zod";
import { objectIdSchema } from "./common.validator.js";

export const holdSeatsSchema = z
  .object({
    seatIds: z.array(objectIdSchema).min(1).max(10),
  })
  .strict()
  .refine((payload) => new Set(payload.seatIds).size === payload.seatIds.length, {
    message: "seatIds must not contain duplicates",
    path: ["seatIds"],
  });

export const releaseHoldSchema = z
  .object({
    holdId: z.string().trim().min(1).max(255),
  })
  .strict();
