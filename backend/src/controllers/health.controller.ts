import type { RequestHandler } from "express";
import mongoose from "mongoose";
import { sendSuccess } from "../utils/api-response.js";

export const getHealth: RequestHandler = (_request, response) => {
  const databaseStatus =
    mongoose.connection.readyState === 1 ? "connected" : "disconnected";

  return sendSuccess(
    response,
    {
      status: "healthy",
      database: { status: databaseStatus },
    },
    "QuickSeats API is running",
  );
};
