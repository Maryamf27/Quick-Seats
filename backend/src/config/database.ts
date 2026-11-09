import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.info("MongoDB connected successfully");
  } catch (error: unknown) {
    const errorType = error instanceof Error ? error.name : "UnknownError";
    console.error(`MongoDB connection failed (${errorType})`);
    throw error;
  }
}
