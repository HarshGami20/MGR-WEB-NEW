import { ymdUtcDayEnd, ymdUtcDayStart } from "./date-range";

export type ExportDateFilterType = "all" | "year" | "month" | "custom";

/** Parse export query params into Prisma createdAt range (gte inclusive, lt exclusive end). */
export function parseExportCreatedAt(query: Record<string, string | undefined>): { gte?: Date; lt?: Date } | undefined {
  const filter = query.filter?.trim() ?? "all";
  if (filter === "all") return undefined;

  const yearParam = query.year ? parseInt(String(query.year), 10) : undefined;
  const monthParam = query.month ? parseInt(String(query.month), 10) : undefined;
  const hasValidYear = Number.isFinite(yearParam) && (yearParam as number) >= 2000 && (yearParam as number) <= 3000;
  const hasValidMonth = Number.isFinite(monthParam) && (monthParam as number) >= 1 && (monthParam as number) <= 12;

  if (filter === "year" && hasValidYear) {
    const y = yearParam as number;
    return {
      gte: new Date(Date.UTC(y, 0, 1, 0, 0, 0)),
      lt: new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0)),
    };
  }

  if (filter === "month" && hasValidYear && hasValidMonth) {
    const y = yearParam as number;
    const m = monthParam as number;
    return {
      gte: new Date(Date.UTC(y, m - 1, 1, 0, 0, 0)),
      lt: new Date(Date.UTC(y, m, 1, 0, 0, 0)),
    };
  }

  if (filter === "custom") {
    const from = query.startDate?.trim();
    const to = query.endDate?.trim();
    const gte = from ? ymdUtcDayStart(from) : undefined;
    const lte = to ? ymdUtcDayEnd(to) : undefined;
    if (!gte && !lte) return undefined;
    const createdAt: { gte?: Date; lt?: Date } = {};
    if (gte) createdAt.gte = gte;
    if (lte) createdAt.lt = new Date(lte.getTime() + 1);
    return createdAt;
  }

  return undefined;
}
