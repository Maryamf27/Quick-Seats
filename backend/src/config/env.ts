import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().trim().min(1, "MONGODB_URI is required"),
  REDIS_URL: z
    .string()
    .trim()
    .url()
    .refine((value) => /^rediss?:\/\//i.test(value), "REDIS_URL must use redis:// or rediss://")
    .optional(),
  BULLMQ_REDIS_URL: z
    .string()
    .trim()
    .url()
    .refine((value) => /^rediss?:\/\//i.test(value), "BULLMQ_REDIS_URL must use redis:// or rediss://")
    .optional(),
  CACHE_EVENT_TTL_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  CACHE_EVENT_LIST_TTL_SECONDS: z.coerce.number().int().min(1).max(3600).default(30),
  CACHE_VENUE_TTL_SECONDS: z.coerce.number().int().min(1).max(86400).default(300),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(100000).default(300),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(86400000).default(900000),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(10000).default(20),
  AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(1000).default(8),
  SEAT_HOLD_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
  SEAT_HOLD_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(10000).default(8),
  SEAT_HOLD_IP_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(100000).default(40),
  CHECKOUT_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
  CHECKOUT_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(10000).default(5),
  CHECKOUT_IP_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(100000).default(30),
  EVENT_READ_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
  EVENT_READ_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(100000).default(120),
  EVENT_BURST_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(1000000).default(10000),
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
  BOOKING_CLEANUP_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(3600).default(60),
  SEAT_NOTIFICATION_OUTBOX_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(3600).default(5),
  BACKGROUND_JOB_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  BACKGROUND_JOB_BACKOFF_MS: z.coerce.number().int().min(100).max(3600000).default(5000),
  REPORT_JOB_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
  REPORT_RECOVERY_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(3600).default(15),
  STRIPE_SECRET_KEY: z
    .string()
    .trim()
    .min(20)
    .regex(/^sk_(test|live)_/)
    .refine((value) => !value.includes("replace_me"), "Replace the Stripe key placeholder"),
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
  BOOKING_CANCELLATION_CUTOFF_HOURS: z.coerce.number().int().min(0).max(24 * 30).default(24),
  // Outgoing email. Without SMTP_URL the mailer only logs what it would have sent, which is
  // what you want locally and in CI.
  SMTP_URL: z.string().trim().min(1).optional(),
  EMAIL_FROM: z.string().trim().min(3).default("QuickSeats <no-reply@quickseats.local>"),
  SALES_SUMMARY_EMAIL_CRON: z.string().trim().min(9).default("0 8 * * 1"),
  SALES_SUMMARY_WINDOW_DAYS: z.coerce.number().int().min(1).max(60).default(7),
}).superRefine((configuration, context) => {
  if (configuration.NODE_ENV !== "production") {
    return;
  }

  if (!configuration.REDIS_URL) {
    context.addIssue({
      code: "custom",
      path: ["REDIS_URL"],
      message: "REDIS_URL is required in production for shared rate limiting",
    });
  }
  if (!configuration.BULLMQ_REDIS_URL) {
    context.addIssue({
      code: "custom",
      path: ["BULLMQ_REDIS_URL"],
      message: "BULLMQ_REDIS_URL is required in production for background workers",
    });
  }
  if (!process.env.CLIENT_ORIGIN) {
    context.addIssue({
      code: "custom",
      path: ["CLIENT_ORIGIN"],
      message: "CLIENT_ORIGIN must be explicitly configured in production",
    });
  }
  if (
    !process.env.INTERNAL_CLEANUP_SECRET ||
    configuration.INTERNAL_CLEANUP_SECRET.includes("replace-with")
  ) {
    context.addIssue({
      code: "custom",
      path: ["INTERNAL_CLEANUP_SECRET"],
      message: "A non-placeholder INTERNAL_CLEANUP_SECRET is required in production",
    });
  }
  if (
    configuration.JWT_ACCESS_SECRET.includes("replace") ||
    configuration.INITIAL_ADMIN_PASSWORD.includes("replace") ||
    configuration.INITIAL_ADMIN_EMAIL.endsWith("@example.test")
  ) {
    context.addIssue({
      code: "custom",
      path: ["JWT_ACCESS_SECRET"],
      message: "Replace all security credential placeholders before production",
    });
  }
});

const environmentResult = environmentSchema.safeParse(process.env);

if (!environmentResult.success) {
  const issues = environmentResult.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = environmentResult.data;
