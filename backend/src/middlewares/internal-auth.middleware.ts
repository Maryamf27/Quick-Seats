import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";

export const requireInternalSecret: RequestHandler = (request, _response, next) => {
  const secret = request.headers["x-internal-secret"];

  if (typeof secret !== "string" || secret !== env.INTERNAL_CLEANUP_SECRET) {
    return next(new AppError("Forbidden", 403));
  }

  return next();
};
