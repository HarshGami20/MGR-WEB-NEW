import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

function redactBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  if (Array.isArray(body)) return body.map(redactBody);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    const lk = k.toLowerCase();
    if (lk.includes("password") || lk === "token" || lk === "secret") {
      out[k] = "[redacted]";
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Logs every JSON error response (status >= 400) so backend logs show what the mobile/web client received.
 */
export function logApiErrorResponses(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);
  res.json = function jsonWithErrorLog(body: unknown) {
    const status = res.statusCode || 200;
    if (status >= 400) {
      const user = (req as Request & { user?: { id?: number } }).user;
      logger.warn(
        {
          method: req.method,
          path: req.originalUrl?.split("?")[0] ?? req.path,
          status,
          response: body,
          userId: user?.id,
          body: req.method !== "GET" && req.method !== "HEAD" ? redactBody(req.body) : undefined,
          query: Object.keys(req.query ?? {}).length > 0 ? req.query : undefined,
        },
        "API error response",
      );
    }
    return originalJson(body);
  };
  next();
}
