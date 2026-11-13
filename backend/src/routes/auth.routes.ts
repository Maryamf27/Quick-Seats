import { Router } from "express";
import {
  getCurrentUserController,
  loginController,
  logoutController,
  registerController,
  updateProfileController,
  changePasswordController,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authRateLimit } from "../middlewares/rate-limit.middleware.js";

export const authRouter = Router();

authRouter.post("/auth/register", authRateLimit, registerController);
authRouter.post("/auth/login", authRateLimit, loginController);
authRouter.get("/auth/me", authenticate, getCurrentUserController);
authRouter.post("/auth/logout", authenticate, logoutController);
authRouter.patch("/auth/me", authenticate, updateProfileController);
authRouter.post("/auth/change-password", authenticate, changePasswordController);
