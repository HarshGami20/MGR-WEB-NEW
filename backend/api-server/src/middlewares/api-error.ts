import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { logger } from "../lib/logger";

function friendlyUploadMessage(err: unknown): string | null {
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        return "Image file is too large.";
      case "LIMIT_UNEXPECTED_FILE":
        return "Unexpected file field.";
      case "LIMIT_FILE_COUNT":
        return "Too many files uploaded.";
      default:
        return "Invalid image upload.";
    }
  }

  if (err instanceof Error) {
    const normalized = err.message.trim().toLowerCase();
    if (normalized.includes("only image")) return "Only image files can be uploaded.";
  }

  return null;
}

export const apiErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const uploadMessage = friendlyUploadMessage(err);
  if (uploadMessage) {
    res.status(400).json({ error: uploadMessage });
    return;
  }

  const user = (req as { user?: { id?: number } }).user;
  logger.error(
    {
      err,
      path: req.originalUrl?.split("?")[0] ?? req.path,
      method: req.method,
      userId: user?.id,
      body:
        req.method !== "GET" && req.method !== "HEAD" && req.body && typeof req.body === "object"
          ? redactSensitive(req.body as Record<string, unknown>)
          : undefined,
    },
    "Unhandled API error",
  );
  res.status(500).json({ error: "Something went wrong. Please try again." });
};

function redactSensitive(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  for (const key of Object.keys(out)) {
    if (key.toLowerCase().includes("password") || key === "token" || key === "secret") {
      out[key] = "[redacted]";
    }
  }
  return out;
}
