import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().trim().min(1, "MONGODB_URI is required"),
  CLIENT_ORIGIN: z.string().url().default(process.env.CLIENT_URL ?? "http://localhost:3000"),
  SOCKET_CORS_ORIGINS: z
    .string()
    .default(
      process.env.CLIENT_ORIGIN ??
        process.env.CLIENT_URL ??
        "http://localhost:3000",
    )
    .transform((value) => value.split(",").map((origin) => origin.trim()))
    .pipe(z.array(z.string().url()).min(1)),
  JWT_ACCESS_SECRET: z
    .string()
    .trim()
    .min(32, "JWT_ACCESS_SECRET must be at least 32 characters long"),
  JWT_ACCESS_EXPIRES_IN: z.string().trim().min(1, "JWT_ACCESS_EXPIRES_IN is required"),
  INITIAL_ADMIN_NAME: z.string().trim().min(1, "INITIAL_ADMIN_NAME is required"),
  INITIAL_ADMIN_EMAIL: z.string().trim().email("INITIAL_ADMIN_EMAIL must be a valid email"),
  INITIAL_ADMIN_PASSWORD: z
    .string()
    .trim()
    .min(8, "INITIAL_ADMIN_PASSWORD must be at least 8 characters long"),
  SEAT_HOLD_DURATION_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(1440)
    .default(10),
  INTERNAL_CLEANUP_SECRET: z
    .string()
    .trim()
    .min(32, "INTERNAL_CLEANUP_SECRET must be at least 32 characters long")
    .default("replace-with-a-long-random-secret-for-seat-cleanup"),
  SEAT_CLEANUP_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .min(5)
    .max(3600)
    .default(60),
  STRIPE_SECRET_KEY: z
    .string()
    .trim()
    .min(20)
    .startsWith("sk_test_")
    .refine((value) => !value.includes("replace_me"), "Replace the Stripe test key placeholder"),
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .trim()
    .min(20)
    .startsWith("whsec_")
    .refine((value) => !value.includes("replace_me"), "Replace the Stripe webhook secret placeholder"),
  STRIPE_CURRENCY: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .transform((value) => value.toLowerCase()),
  STRIPE_CHECKOUT_SUCCESS_URL: z.string().url(),
  STRIPE_CHECKOUT_CANCEL_URL: z.string().url(),
  PAYMENT_HOLD_DURATION_MINUTES: z.coerce.number().int().min(30).max(1440).default(30),
});

const environmentResult = environmentSchema.safeParse(process.env);

if (!environmentResult.success) {
  const issues = environmentResult.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = environmentResult.data;
