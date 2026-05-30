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

  logger.error({ err, path: req.path, method: req.method }, "Unhandled API error");
  res.status(500).json({ error: "Something went wrong. Please try again." });
};
