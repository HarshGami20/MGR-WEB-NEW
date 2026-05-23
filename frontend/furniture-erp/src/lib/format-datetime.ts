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
