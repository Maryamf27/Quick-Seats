import jwt from "jsonwebtoken";
import { UserModel } from "../models/user.model.js";
import { env } from "../config/env.js";
import type { SafeUser } from "../types/auth.types.js";
import { AppError } from "../utils/app-error.js";
import { hashPassword, comparePassword } from "../utils/password.js";
import { isDuplicateKeyError, parseInput } from "../utils/validation.js";
import {
  changePasswordSchema,
  loginUserSchema,
  registerUserSchema,
  updateProfileSchema,
} from "../validators/auth.validator.js";
import type { UserRole } from "../types/domain.js";

export function assertPublicRegistrationRole(role?: UserRole): void {
  if (role && role !== "USER") {
    throw new AppError("Public registration cannot assign organizer or admin roles", 400);
  }
}

function sanitizeUser(user: { _id: { toString(): string }; fullName: string; email: string; role: string; createdAt: Date; updatedAt: Date }): SafeUser {
  return {
    _id: user._id.toString(),
    fullName: user.fullName,
    email: user.email,
    role: user.role as SafeUser["role"],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function registerUser(input: unknown) {
  const data = parseInput(registerUserSchema, input);
  const email = data.email.toLowerCase();

  assertPublicRegistrationRole(data.role);

  try {
    const passwordHash = await hashPassword(data.password);
    const user = await UserModel.create({
      fullName: data.fullName,
      email,
      passwordHash,
      role: "USER",
    });

    return sanitizeUser(user.toObject());
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) {
      throw new AppError("An account with this email already exists", 409);
    }
    throw error;
  }
}

export async function loginUser(input: unknown) {
  const data = parseInput(loginUserSchema, input);
  const email = data.email.toLowerCase();

  const user = await UserModel.findOne({ email }).select("+passwordHash").exec();

  if (!user || !user.passwordHash) {
    throw new AppError("Invalid email or password", 401);
  }

  const isValidPassword = await comparePassword(data.password, user.passwordHash);

  if (!isValidPassword) {
    throw new AppError("Invalid email or password", 401);
  }

  if (user.isSuspended) {
    throw new AppError("This account has been suspended", 403);
  }

  const token = jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
    },
    env.JWT_ACCESS_SECRET as string,
    {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    } as jwt.SignOptions,
  );

  return {
    token,
    user: sanitizeUser(user.toObject()),
  };
}

export async function getCurrentUser(userId: string) {
  const user = await UserModel.findById(userId).exec();

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return sanitizeUser(user.toObject());
}

export async function updateProfile(userId: string, input: unknown) {
  const data = parseInput(updateProfileSchema, input);
  const user = await UserModel.findByIdAndUpdate(
    userId,
    { $set: { fullName: data.fullName } },
    { new: true, runValidators: true },
  ).exec();

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return sanitizeUser(user.toObject());
}

export async function changePassword(userId: string, input: unknown): Promise<void> {
  const data = parseInput(changePasswordSchema, input);
  const user = await UserModel.findById(userId).select("+passwordHash").exec();

  if (!user || !user.passwordHash) {
    throw new AppError("User not found", 404);
  }

  const matches = await comparePassword(data.currentPassword, user.passwordHash);
  if (!matches) {
    throw new AppError("Current password is incorrect", 400);
  }

  user.passwordHash = await hashPassword(data.newPassword);
  await user.save();
}
