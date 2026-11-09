import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().trim().min(1, "MONGODB_URI is required"),
  CLIENT_URL: z.string().url().default("http://localhost:3000"),
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
});

const environmentResult = environmentSchema.safeParse(process.env);

if (!environmentResult.success) {
  const issues = environmentResult.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = environmentResult.data;
