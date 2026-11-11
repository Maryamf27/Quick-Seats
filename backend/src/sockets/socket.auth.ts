import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { env } from "../config/env.js";
import { UserModel } from "../models/user.model.js";
import type { JwtPayload } from "../types/auth.types.js";
import type { QuickSeatsSocketServer } from "./socket.types.js";

export function registerSocketAuthentication(io: QuickSeatsSocketServer): void {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;

    if (token === undefined || token === null || token === "") {
      return next();
    }

    if (typeof token !== "string") {
      return next(new Error("Invalid authentication token"));
    }

    let payload: string | jwt.JwtPayload;
    try {
      payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    } catch {
      return next(new Error("Invalid or expired authentication token"));
    }

    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      !Types.ObjectId.isValid(payload.sub)
    ) {
      return next(new Error("Invalid authentication token"));
    }

    try {
      const user = await UserModel.findById(payload.sub)
        .select("_id role")
        .lean()
        .exec();

      if (!user) {
        return next(new Error("Authenticated user no longer exists"));
      }

      const authenticatedUser: JwtPayload = {
        sub: user._id.toString(),
        role: user.role,
      };
      socket.data.user = {
        id: authenticatedUser.sub,
        role: authenticatedUser.role,
      };

      return next();
    } catch (error: unknown) {
      const errorType = error instanceof Error ? error.name : "UnknownError";
      console.error(`Socket authentication user lookup failed (${errorType})`);
      return next(new Error("Unable to authenticate socket connection"));
    }
  });
}
