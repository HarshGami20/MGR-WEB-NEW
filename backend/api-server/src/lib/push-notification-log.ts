import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { logger } from "./logger";

export type WebPushLogEvent =
  | "token_saved"
  | "token_removed"
  | "push_scheduled"
  | "push_queued"
  | "push_inline"
  | "push_sent"
  | "push_failed"
  | "push_no_tokens"
  | "push_test"
  | "push_test_failed"
  | "firebase_unavailable";

type LogLevel = "debug" | "info" | "warn" | "error";

export function logWebPush(
  event: WebPushLogEvent,
  detail: Record<string, unknown>,
  level: LogLevel = "info",
): void {
  const payload = { ns: "web-push", event, ...detail };
  const msg = `web-push: ${event}`;
  if (level === "error") logger.error(payload, msg);
  else if (level === "warn") logger.warn(payload, msg);
  else if (level === "debug") logger.debug(payload, msg);
  else logger.info(payload, msg);
}

/** Persist push delivery attempt for admin / debug UI (optional userId). */
export async function persistPushLog(opts: {
  userId?: number | null;
  notificationId?: string | null;
  status: "sent" | "failed" | "skipped";
  detail: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.notificationLog.create({
      data: {
        userId: opts.userId ?? null,
        notificationId: opts.notificationId ?? null,
        channel: "push",
        status: opts.status,
        detail: opts.detail as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.warn({ err, ns: "web-push" }, "web-push: failed to persist notification_log row");
  }
}
