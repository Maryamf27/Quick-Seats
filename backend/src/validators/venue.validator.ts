import { z } from "zod";
import { SEAT_CATEGORIES } from "../types/domain.js";
import { paginationSchema } from "./common.validator.js";

const addressSchema = z
  .object({
    street: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(1).max(100),
    country: z.string().trim().min(1).max(100),
    postalCode: z.string().trim().min(1).max(20),
  })
  .strict();

export const venueSectionSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    rows: z.number().int().positive(),
    seatsPerRow: z.number().int().positive(),
    seatCategory: z.enum(SEAT_CATEGORIES),
    price: z.number().finite().nonnegative().optional(),
  })
  .strict();

function validateSections(
  sections: Array<z.output<typeof venueSectionSchema>>,
  capacity: number,
  context: z.RefinementCtx,
): void {
  const sectionNames = sections.map((section) => section.name.toLocaleLowerCase());
  if (new Set(sectionNames).size !== sectionNames.length) {
    context.addIssue({
      code: "custom",
      path: ["sections"],
      message: "Section names must be unique within a venue",
    });
  }

  const configuredSeatCount = sections.reduce(
    (total, section) => total + section.rows * section.seatsPerRow,
    0,
  );
  if (configuredSeatCount > capacity) {
    context.addIssue({
      code: "custom",
      path: ["capacity"],
      message: "Capacity cannot be less than the configured seat count",
    });
  }
}

export const createVenueSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    description: z.string().trim().max(5000).default(""),
    address: addressSchema,
    capacity: z.number().int().positive(),
    sections: z.array(venueSectionSchema).min(1),
  })
  .strict()
  .superRefine((venue, context) =>
    validateSections(venue.sections, venue.capacity, context),
  );

export const updateVenueSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().max(5000).optional(),
    address: addressSchema.optional(),
    capacity: z.number().int().positive().optional(),
    sections: z.array(venueSectionSchema).min(1).optional(),
  })
  .strict()
  .refine((venue) => Object.keys(venue).length > 0, {
    message: "At least one field must be provided",
  });

export const listVenuesQuerySchema = z
  .object({
    ...paginationSchema,
    search: z.string().trim().max(100).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    sortBy: z.enum(["name", "city", "createdAt"]).default("name"),
    order: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();
