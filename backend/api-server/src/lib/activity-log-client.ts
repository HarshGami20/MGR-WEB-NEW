import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

export const ACTIVITY_LOG_SETUP_MESSAGE =
  "Activity logs are unavailable. Run `npx prisma migrate deploy && npx prisma generate` on the API server, then restart.";

export function getActivityLogDelegate(): PrismaClient["activityLog"] | null {
  const delegate = (prisma as PrismaClient & { activityLog?: PrismaClient["activityLog"] }).activityLog;
  return delegate ?? null;
}
