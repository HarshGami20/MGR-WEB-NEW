import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parse,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";

/** Inclusive date range as `YYYY-MM-DD` strings (API-friendly). */
export type DateRangeValue = {
  from?: string;
  to?: string;
};

export function localTodayYmd(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function isPastYmdDate(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return v < localTodayYmd();
}

export function ymdToDate(ymd?: string | null): Date | undefined {
  if (!ymd?.trim()) return undefined;
  const parsed = parse(ymd.trim(), "yyyy-MM-dd", new Date());
  return isValid(parsed) ? parsed : undefined;
}

export function dateToYmd(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Start of calendar day in UTC (for API `createdAt` filters). */
export function ymdUtcDayStart(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0));
}

/** End of calendar day in UTC (for API `createdAt` filters). */
export function ymdUtcDayEnd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999));
}

export function normalizeYmdRange(fromYmd: string, toYmd: string): { fromYmd: string; toYmd: string } {
  let from = fromYmd.trim();
  let to = toYmd.trim();
  if (from && to && from > to) {
    const t = from;
    from = to;
    to = t;
  }
  return { fromYmd: from, toYmd: to };
}

export function addDaysYmd(ymd: string, days: number): string {
  const base = ymdToDate(ymd);
  if (!base) return ymd;
  return dateToYmd(addDays(base, days));
}

export function isDateRangeComplete(value: DateRangeValue): boolean {
  return Boolean(value.from?.trim() && value.to?.trim());
}

export function isDateRangeActive(value: DateRangeValue): boolean {
  return Boolean(value.from?.trim() || value.to?.trim());
}

export function formatYmdLabel(
  ymd: string | undefined,
  options?: { placeholder?: string; locale?: string },
): string {
  const placeholder = options?.placeholder ?? "Select date";
  const value = ymd?.trim();
  if (!value) return placeholder;
  const d = ymdToDate(value);
  if (!d) return value;
  return d.toLocaleDateString(options?.locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateRangeLabel(
  value: DateRangeValue,
  options?: { placeholder?: string; locale?: string },
): string {
  const placeholder = options?.placeholder ?? "Select date range";
  const from = value.from?.trim();
  const to = value.to?.trim();
  if (!from && !to) return placeholder;
  const fmt = (ymd: string) => {
    const d = ymdToDate(ymd);
    if (!d) return ymd;
    return d.toLocaleDateString(options?.locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };
  if (from && to) {
    if (from === to) return fmt(from);
    return `${fmt(from)} – ${fmt(to)}`;
  }
  if (from) return `From ${fmt(from)}`;
  return `Until ${fmt(to!)}`;
}

export type DateRangePreset = {
  id: string;
  label: string;
  getValue: () => DateRangeValue;
};

export function getDefaultDateRangePresets(): DateRangePreset[] {
  const today = localTodayYmd();
  const todayDate = ymdToDate(today)!;
  return [
    {
      id: "today",
      label: "Today",
      getValue: () => ({ from: today, to: today }),
    },
    {
      id: "last7",
      label: "Last 7 days",
      getValue: () => ({ from: dateToYmd(subDays(todayDate, 6)), to: today }),
    },
    {
      id: "last30",
      label: "Last 30 days",
      getValue: () => ({ from: dateToYmd(subDays(todayDate, 29)), to: today }),
    },
    {
      id: "this_week",
      label: "This week",
      getValue: () => ({
        from: dateToYmd(startOfWeek(todayDate, { weekStartsOn: 1 })),
        to: dateToYmd(endOfWeek(todayDate, { weekStartsOn: 1 })),
      }),
    },
    {
      id: "this_month",
      label: "This month",
      getValue: () => ({
        from: dateToYmd(startOfMonth(todayDate)),
        to: dateToYmd(endOfMonth(todayDate)),
      }),
    },
  ];
}
