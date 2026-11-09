import type { ErrorRequestHandler } from "express";
import { env } from "../config/env.js";
import { sendError } from "../utils/api-response.js";
import { AppError } from "../utils/app-error.js";

function getStatusCode(error: unknown): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 500
  ) {
    return error.status;
  }

  return 500;
}

export const errorMiddleware: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next,
) => {
  const isAppError = error instanceof AppError;
  const statusCode = getStatusCode(error);
  const message = isAppError
    ? error.message
    : env.NODE_ENV === "development" && error instanceof Error
      ? error.message
      : "Something went wrong";

  if (statusCode >= 500) {
    if (env.NODE_ENV === "development") {
      console.error("Request error", error);
    } else {
      const errorType = error instanceof Error ? error.name : "UnknownError";
      console.error(`Request error (${errorType})`);
    }
  }

  return sendError(response, message, statusCode);
};
