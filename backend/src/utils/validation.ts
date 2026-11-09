import { z } from "zod";
import { AppError } from "./app-error.js";

export function parseInput<T extends z.ZodType>(
  schema: T,
  input: unknown,
): z.output<T> {
  const result = schema.safeParse(input);

  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
      .join("; ");
    throw new AppError(message, 400);
  }

  return result.data;
}

export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}
