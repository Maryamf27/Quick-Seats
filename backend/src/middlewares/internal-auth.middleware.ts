import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";

export const requireInternalSecret: RequestHandler = (request, _response, next) => {
  const secret = request.headers["x-internal-secret"];
  const expectedSecret = Buffer.from(env.INTERNAL_CLEANUP_SECRET);

  if (
    typeof secret !== "string" ||
    Buffer.byteLength(secret) !== expectedSecret.length ||
    !timingSafeEqual(Buffer.from(secret), expectedSecret)
  ) {
    return next(new AppError("Forbidden", 403));
  }

  return next();
};
