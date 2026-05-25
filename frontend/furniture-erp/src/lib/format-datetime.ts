/** e.g. 22 May 2026, 2:30 pm (IST, 12-hour) */
export function formatIndianDateTime(iso: string | Date | null | undefined): string {
  if (iso == null || iso === "") return "—";
  try {
    const d = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return String(iso);
  }
}

type DisplayDateOptions = {
  includeTime?: boolean;
  includeWeekday?: boolean;
};

/** e.g. May 25, 2026 or May 25, 2026, 10:30 AM */
export function formatDisplayDate(
  value: string | Date | null | undefined,
  options: DisplayDateOptions = {},
): string {
  if (value == null || value === "") return "—";
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(undefined, {
      ...(options.includeWeekday ? { weekday: "short" as const } : {}),
      month: "long",
      day: "numeric",
      year: "numeric",
      ...(options.includeTime
        ? {
            hour: "numeric" as const,
            minute: "2-digit" as const,
            hour12: true,
          }
        : {}),
    }).format(date);
  } catch {
    return String(value);
  }
}
