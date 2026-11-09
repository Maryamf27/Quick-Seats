import { Router } from "express";
import {
  getCurrentUserController,
  loginController,
  logoutController,
  registerController,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

export const authRouter = Router();

authRouter.post("/auth/register", registerController);
authRouter.post("/auth/login", loginController);
authRouter.get("/auth/me", authenticate, getCurrentUserController);
authRouter.post("/auth/logout", authenticate, logoutController);
