import type { RequestHandler } from "express";
import { AppError } from "../utils/app-error.js";
import type { UserRole } from "../types/domain.js";

export function authorize(...requiredRoles: UserRole[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.user) {
      return next(new AppError("Authentication required", 401));
    }

    if (!requiredRoles.includes(request.user.role)) {
      return next(new AppError("You do not have permission to perform this action", 403));
    }

    return next();
  };
}
