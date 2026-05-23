export type ExportDateFilterType = "all" | "year" | "month" | "custom";

export type ExportDateFilter = {
  type: ExportDateFilterType;
  year?: string;
  month?: string;
  startDate?: string;
  endDate?: string;
};

export function exportDateQueryString(filter: ExportDateFilter): string {
  const params = new URLSearchParams();
  params.set("filter", filter.type);
  if (filter.type === "year" || filter.type === "month") {
    if (filter.year) params.set("year", filter.year);
  }
  if (filter.type === "month" && filter.month) {
    params.set("month", filter.month);
  }
  if (filter.type === "custom") {
    if (filter.startDate) params.set("startDate", filter.startDate);
    if (filter.endDate) params.set("endDate", filter.endDate);
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function exportDateFilename(prefix: string, filter: ExportDateFilter): string {
  if (filter.type === "all") return `${prefix}_all.xlsx`;
  if (filter.type === "year" && filter.year) return `${prefix}_${filter.year}.xlsx`;
  if (filter.type === "month" && filter.year && filter.month) {
    const name = MONTH_NAMES[parseInt(filter.month, 10) - 1] ?? filter.month;
    return `${prefix}_${name}_${filter.year}.xlsx`;
  }
  if (filter.type === "custom" && filter.startDate && filter.endDate) {
    return `${prefix}_${filter.startDate}_to_${filter.endDate}.xlsx`;
  }
  return `${prefix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
}

export function yearOptions(): string[] {
  const y = new Date().getFullYear();
  return Array.from({ length: 8 }, (_, i) => String(y - i));
}

export const EXPORT_MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];
