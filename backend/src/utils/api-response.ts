import type { Response } from "express";

export interface SuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

export interface ErrorResponse {
  success: false;
  message: string;
}

export function sendSuccess<T>(
  response: Response,
  data: T,
  message = "Request successful",
  statusCode = 200,
) {
  return response.status(statusCode).json({
    success: true,
    message,
    data,
  } satisfies SuccessResponse<T>);
}

export function sendError(
  response: Response,
  message: string,
  statusCode: number,
) {
  return response.status(statusCode).json({
    success: false,
    message,
  } satisfies ErrorResponse);
}
