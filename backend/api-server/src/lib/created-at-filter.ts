import type { Prisma } from "@prisma/client";
import { ymdUtcDayEnd, ymdUtcDayStart } from "./date-range";

/** Build Prisma `createdAt` filter from `YYYY-MM-DD` query params. */
export function createdAtRangeFromQuery(
  createdFrom?: string,
  createdTo?: string,
): Prisma.DateTimeFilter | undefined {
  const filter: Prisma.DateTimeFilter = {};
  if (typeof createdFrom === "string" && createdFrom.trim()) {
    const start = ymdUtcDayStart(createdFrom.trim());
    if (start) filter.gte = start;
  }
  if (typeof createdTo === "string" && createdTo.trim()) {
    const end = ymdUtcDayEnd(createdTo.trim());
    if (end) filter.lte = end;
  }
  return filter.gte != null || filter.lte != null ? filter : undefined;
}
