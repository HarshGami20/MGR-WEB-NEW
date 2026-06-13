import { useMemo } from "react";
import { Link } from "wouter";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatInr } from "@/lib/format-currency";
import { buildSourceItems, type CategoryRevenueRow } from "@/lib/dashboard-category-charts";

const MONTHS = [
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

type Props = {
  categoryWise: CategoryRevenueRow[] | null | undefined;
  year: number;
  month: number;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  yearOptions: number[];
  loading?: boolean;
};

export function DashboardCategorySourceCard({
  categoryWise,
  year,
  month,
  onYearChange,
  onMonthChange,
  yearOptions,
  loading,
}: Props) {
  const { total, items } = useMemo(
    () => buildSourceItems(categoryWise ?? []),
    [categoryWise],
  );

  return (
    <div className="rounded-3xl border border-border bg-card p-5 md:p-6 shadow-sm h-full flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Source</h2>
        <div className="flex items-center gap-2">
          <select
            value={`${year}-${month}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              onYearChange(y);
              onMonthChange(m);
            }}
            className="appearance-none rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 max-w-[140px]"
            aria-label="Filter source by month"
          >
            {yearOptions.flatMap((y) =>
              MONTHS.map((name, idx) => (
                <option key={`${y}-${idx + 1}`} value={`${y}-${idx + 1}`}>
                  {name.slice(0, 3)} {y}
                </option>
              )),
            )}
          </select>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border text-muted-foreground"
            aria-label="More options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground py-16">
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded-2xl py-16">
          No category revenue in this period
        </div>
      ) : (
        <>
          <div className="mt-6">
            <p className="text-3xl font-bold tracking-tight tabular-nums">
              {total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </p>
            <p className="text-sm text-muted-foreground mt-1">Total source · {formatInr(total)}</p>
          </div>

          <div className="mt-5 h-6 w-full flex items-stretch gap-2">
            {items.map((item) => (
              <div
                key={`${item.categoryId ?? "none"}-${item.name}`}
                className="h-full rounded-full min-w-[10px]"
                style={{ flex: Math.max(item.pct, 2), backgroundColor: item.color }}
              />
            ))}
          </div>

          <ul className="mt-5 space-y-3 flex-1">
            {items.map((item) => (
              <li key={`${item.categoryId ?? "none"}-${item.name}`} className="flex items-center gap-3">
                <span
                  className="w-1 self-stretch rounded-full min-h-[36px]"
                  style={{ backgroundColor: item.color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{formatInr(item.value)}</p>
                </div>
                <Badge
                  variant="secondary"
                  className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums shrink-0")}
                >
                  {item.pct.toFixed(0)}%
                </Badge>
              </li>
            ))}
          </ul>
        </>
      )}

      <Button variant="outline" className="mt-6 w-full rounded-2xl h-11" asChild>
        <Link href="/reports">View Details</Link>
      </Button>
    </div>
  );
}
