import { z } from "zod";

export const reportRangeSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict()
  .refine((range) => !range.from || !range.to || range.from <= range.to, {
    message: "from must be before or equal to to",
    path: ["from"],
  });

export const reportIdParamsSchema = z
  .object({ reportId: z.string().regex(/^[a-f\d]{24}$/i) })
  .strict();
