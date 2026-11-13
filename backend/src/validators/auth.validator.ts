import { z } from "zod";
import { USER_ROLES } from "../types/domain.js";

const passwordSchema = z
  .string()
  .trim()
  .min(8, "Password must be at least 8 characters long")
  .max(128, "Password must be at most 128 characters long")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const registerUserSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    password: passwordSchema,
    role: z.enum(USER_ROLES).optional(),
  })
  .strict();

export const loginUserSchema = z
  .object({
    email: z.string().trim().email().max(254),
    password: z.string().trim().min(1, "Password is required"),
  })
  .strict();

export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(128),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((payload) => payload.currentPassword !== payload.newPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"],
  });
