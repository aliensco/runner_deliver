import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, "API endpoint not found", "NOT_FOUND"));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.issues
      }
    });
    return;
  }

  if (error && typeof error === "object" && error.type === "entity.parse.failed") {
    res.status(400).json({
      error: { code: "MALFORMED_JSON", message: "Request body contains malformed JSON" }
    });
    return;
  }

  if (error && typeof error === "object" && error.type === "entity.too.large") {
    res.status(413).json({
      error: { code: "PAYLOAD_TOO_LARGE", message: "Request body exceeds the size limit" }
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details })
      }
    });
    return;
  }

  console.error(error instanceof Error ? `${error.name}: ${error.message}` : "Unknown server error");
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Internal server error" }
  });
};
