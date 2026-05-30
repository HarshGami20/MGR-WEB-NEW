import type { NextFunction, Request, Response } from "express";
import { persistAuditFromRequest, type AuditMeta } from "../lib/activity-log";

declare global {
  namespace Express {
    interface Locals {
      auditMeta?: AuditMeta;
      /** Prevents duplicate activity log rows for a single HTTP response. */
      auditPersisted?: boolean;
      /** Set when audit middleware has already patched this response. */
      auditHooked?: boolean;
    }
  }
}

/** Captures successful POST/PUT/PATCH/DELETE responses into activity_logs. */
export function auditLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    next();
    return;
  }

  if (res.locals.auditHooked) {
    next();
    return;
  }
  res.locals.auditHooked = true;

  let responseBody: unknown;
  const originalJson = res.json.bind(res);
  res.json = function jsonWithAudit(body: unknown) {
    responseBody = body;
    return originalJson(body);
  };

  res.once("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    if (res.locals.auditPersisted) return;
    void persistAuditFromRequest(req, res, responseBody);
  });

  next();
}
