import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { UserModel } from "../models/user.model.js";
import type { JwtPayload } from "../types/auth.types.js";
import { AppError } from "../utils/app-error.js";

export const authenticate: RequestHandler = async (request, _response, next) => {
  try {
    const authorizationHeader = request.headers.authorization;

    if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
      throw new AppError("Authentication token is required", 401);
    }

    const token = authorizationHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      throw new AppError("Authentication token is required", 401);
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
    } catch {
      throw new AppError("Invalid or expired token", 401);
    }

    if (!payload.sub) {
      throw new AppError("Invalid token payload", 401);
    }

    const user = await UserModel.findById(payload.sub).exec();

    if (!user) {
      throw new AppError("User not found", 401);
    }

    request.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    return next();
  } catch (error: unknown) {
    return next(error);
  }
};
