import type { RequestHandler } from "express";
import {
  changePassword,
  getCurrentUser,
  loginUser,
  registerUser,
  updateProfile,
} from "../services/auth.service.js";
import { sendSuccess } from "../utils/api-response.js";

export const registerController: RequestHandler = async (request, response) => {
  const user = await registerUser(request.body);
  return sendSuccess(response, user, "User registered successfully", 201);
};

export const loginController: RequestHandler = async (request, response) => {
  const result = await loginUser(request.body);
  return sendSuccess(response, result, "Login successful");
};

export const getCurrentUserController: RequestHandler = async (request, response) => {
  if (!request.user) {
    return response.status(401).json({ success: false, message: "Authentication required" });
  }

  const user = await getCurrentUser(request.user.id);
  return sendSuccess(response, user, "User profile retrieved successfully");
};

export const logoutController: RequestHandler = (_request, response) => {
  return sendSuccess(
    response,
    null,
    "Logout successful. Remove the JWT from the client to log out locally. Stateless JWTs are not revoked on the server in this phase.",
  );
};

export const updateProfileController: RequestHandler = async (request, response) => {
  if (!request.user) {
    return response.status(401).json({ success: false, message: "Authentication required" });
  }

  const user = await updateProfile(request.user.id, request.body);
  return sendSuccess(response, user, "Profile updated successfully");
};

export const changePasswordController: RequestHandler = async (request, response) => {
  if (!request.user) {
    return response.status(401).json({ success: false, message: "Authentication required" });
  }

  await changePassword(request.user.id, request.body);
  return sendSuccess(response, null, "Password changed successfully");
};
