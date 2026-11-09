import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import { UserModel } from "../models/user.model.js";
import { hashPassword } from "../utils/password.js";

async function seedAdmin(): Promise<void> {
  await connectDatabase();

  const email = env.INITIAL_ADMIN_EMAIL.toLowerCase();
  const existing = await UserModel.findOne({ email }).exec();

  if (existing) {
    console.info("Initial admin already exists; skipping creation");
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await hashPassword(env.INITIAL_ADMIN_PASSWORD);
  await UserModel.create({
    fullName: env.INITIAL_ADMIN_NAME,
    email,
    passwordHash,
    role: "ADMIN",
  });

  console.info(`Initial admin created for ${email}`);
  await mongoose.disconnect();
}

void seedAdmin().catch((error: unknown) => {
  const errorType = error instanceof Error ? error.name : "UnknownError";
  console.error(`Admin seeding failed (${errorType})`);
  console.error("Ensure JWT and admin environment variables are configured before running the seed script.");
  process.exitCode = 1;
});
