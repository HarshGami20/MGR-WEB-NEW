import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Download, Wallet } from "lucide-react";
import { customFetch } from "@/api-client/custom-fetch";
import { useListBranches } from "@/api-client";
import { useBranch } from "@/lib/branch-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListCategoryFilter } from "@/components/list-category-filter";
import { OrdersExportDialog } from "@/components/orders-export-dialog";
import { formatInr } from "@/lib/format-currency";

type MonthlyRevenue = {
  month: number;
  monthLabel: string;
  revenue: number;
  received: number;
  due: number;
  orders: number;
};

type YearlyRevenue = {
  year: number;
  totalRevenue: number;
  totalReceived: number;
  totalDue: number;
  totalOrders: number;
  months: MonthlyRevenue[];
};

type CategoryRevenue = {
  categoryId: number | null;
  categoryName: string;
  revenue: number;
  orderItems: number;
  quantity: number;
};

type CategoryRevenueMatrix = {
  periodType: "day" | "month";
  periods: Array<{ key: string; label: string }>;
  rows: Array<{
    categoryId: number | null;
    categoryName: string;
    byPeriod: Record<string, number>;
    totalRevenue: number;
  }>;
};

type RevenueSummaryResponse = {
  generatedAt: string;
  filters: {
    year: number | null;
    month: number | null;
    branchId: number | null;
  };
  totals: {
    overallRevenue: number;
    overallReceived: number;
    overallDue: number;
    totalOrders: number;
    yearsCovered: number;
  };
  yearly: YearlyRevenue[];
  daily: Array<{
    date: string;
    day: number;
    revenue: number;
    received: number;
    due: number;
    orders: number;
  }>;
  categoryWise: CategoryRevenue[];
  categoryWiseMatrix: CategoryRevenueMatrix;
};

/** e.g. 2026-05-20 → 20 May 2026 (en-IN) */
function formatReportDateYmd(ymd: string): string {
  try {
    const raw = String(ymd).trim();
    const d = raw.includes("T") ? new Date(raw) : new Date(`${raw.slice(0, 10)}T00:00:00`);
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return ymd;
  }
}

function toCsvLine(values: unknown[]): string {
  return values.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
}

function downloadCsv(filename: string, header: string[], rows: unknown[][]) {
  const csv = [toCsvLine(header), ...rows.map((r) => toCsvLine(r))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Prefer the current calendar year for month view; fall back to latest year in data. */
function defaultYearForMonthView(yearOptionsDesc: number[]): string {
  const currentYear = new Date().getFullYear();
  if (yearOptionsDesc.length === 0) return String(currentYear);
  if (yearOptionsDesc.includes(currentYear)) return String(currentYear);
  return String(yearOptionsDesc[0]);
}

function currentCalendarMonthDefaults(): { year: string; month: string } {
  const now = new Date();
  return {
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
  };
}

const INITIAL_MONTH_FILTER = currentCalendarMonthDefaults();

export default function ReportsPage() {
  const [viewMode, setViewMode] = useState<"year" | "month">("month");
  const [selectedYear, setSelectedYear] = useState<string>(INITIAL_MONTH_FILTER.year);
  const [selectedMonth, setSelectedMonth] = useState<string>(INITIAL_MONTH_FILTER.month);
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const { selectedBranchId, setSelectedBranchId } = useBranch();
  const { data: branchesData } = useListBranches({ isActive: true, limit: 100 });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedYear !== "all") {
      params.set("year", selectedYear);
      if (viewMode === "month" && selectedMonth !== "all") params.set("month", selectedMonth);
    }
    if (selectedBranchId != null) {
      params.set("branchId", String(selectedBranchId));
    }
    if (categoryId != null) {
      params.set("categoryId", String(categoryId));
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [selectedYear, selectedMonth, viewMode, selectedBranchId, categoryId]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["reports", "revenue-summary", queryString],
    queryFn: () => customFetch<RevenueSummaryResponse>(`/api/reports/revenue-summary${queryString}`),
  });

  const yearOptions = useMemo(() => {
    return Array.from(new Set((data?.yearly ?? []).map((y) => y.year))).sort((a, b) => b - a);
  }, [data]);

  const monthlyFlat = useMemo(() => {
    const out: Array<{ year: number } & MonthlyRevenue> = [];
    for (const y of data?.yearly ?? []) {
      for (const m of y.months) out.push({ year: y.year, ...m });
    }
    return out;
  }, [data]);

  const exportMonthlyCsv = () => {
    if (viewMode === "month" && selectedYear !== "all" && selectedMonth !== "all") {
      downloadCsv(
        `revenue-daily-${selectedYear}-${selectedMonth.padStart(2, "0")}.csv`,
        ["Date", "Day", "Revenue", "Received", "Due", "Orders"],
        (data?.daily ?? []).map((d) => [
          formatReportDateYmd(d.date),
          d.day,
          d.revenue.toFixed(2),
          d.received.toFixed(2),
          d.due.toFixed(2),
          d.orders,
        ]),
      );
      return;
    }
    downloadCsv(
      `revenue-monthly-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Year", "Month", "Revenue", "Received", "Due", "Orders"],
      monthlyFlat.map((m) => [m.year, m.monthLabel, m.revenue.toFixed(2), m.received.toFixed(2), m.due.toFixed(2), m.orders]),
    );
  };

  const categoryMatrix = useMemo(() => {
    if (!data) {
      return {
        periodType: "month" as const,
        periods: [] as CategoryRevenueMatrix["periods"],
        rows: [] as CategoryRevenueMatrix["rows"],
      };
    }
    return (
      data.categoryWiseMatrix ?? {
        periodType: "month" as const,
        periods: [{ key: "total", label: "Total" }],
        rows: (data.categoryWise ?? []).map((c) => ({
          categoryId: c.categoryId,
          categoryName: c.categoryName,
          byPeriod: { total: c.revenue },
          totalRevenue: c.revenue,
        })),
      }
    );
  }, [data]);

  const periodColumnLabel =
    categoryMatrix.periodType === "day" ? "Date" : categoryMatrix.periodType === "month" ? "Month" : "Period";

  const categoryColumns = categoryMatrix.rows;

  const periodRows = useMemo(() => {
    return categoryMatrix.periods.map((p) => ({
      key: p.key,
      label: p.label,
      cells: categoryColumns.map((c) => c.byPeriod[p.key] ?? 0),
    }));
  }, [categoryMatrix.periods, categoryColumns]);

  const exportCategoryCsv = () => {
    if (!data) return;
    if (!categoryMatrix.periods.length || !categoryColumns.length) {
      downloadCsv(
        `revenue-category-${new Date().toISOString().slice(0, 10)}.csv`,
        ["Category", "Revenue"],
        (data?.categoryWise ?? []).map((c) => [c.categoryName, c.revenue.toFixed(2)]),
      );
      return;
    }
    const header = [periodColumnLabel, ...categoryColumns.map((c) => c.categoryName)];
    const body = periodRows.map((row) => [row.label, ...row.cells.map((v) => v.toFixed(2))]);
    body.push(["Total", ...categoryColumns.map((c) => c.totalRevenue.toFixed(2))]);
    downloadCsv(`revenue-category-${new Date().toISOString().slice(0, 10)}.csv`, header, body);
  };

  if (isLoading) return <div className="text-muted-foreground">Loading reports…</div>;
  if (isError || !data) return <div className="text-destructive">Failed to load reports: {String((error as any)?.message ?? "Unknown error")}</div>;

  const dailyMode = viewMode === "month" && selectedYear !== "all" && selectedMonth !== "all";
  const totalRevenue = Number(data.totals.overallRevenue || 0);
  const receivedPct = totalRevenue > 0 ? Math.min(100, (Number(data.totals.overallReceived || 0) / totalRevenue) * 100) : 0;
  const duePct = totalRevenue > 0 ? Math.min(100, (Number(data.totals.overallDue || 0) / totalRevenue) * 100) : 0;

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-background -mx-4 -mt-4 px-4 py-8 md:-mx-8 md:px-8 md:py-10">
      <div className="mx-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Revenue Reports</h2>
          <p className="text-muted-foreground">Revenue, received and due analysis by month/day with category breakdown.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OrdersExportDialog categoryId={categoryId} />
          {/* <Button onClick={exportMonthlyCsv}>
            <Download className="mr-2 h-4 w-4" />
            Export revenue CSV
          </Button> */}
        </div>
      </div>
        

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-[linear-gradient(145deg,hsl(var(--primary))_0%,hsl(var(--primary-dim))_42%,hsl(var(--primary-deep))_100%)] p-6 text-primary-foreground shadow-[0_14px_34px_rgba(56,39,67,0.28)]">
            <div
              className="pointer-events-none absolute inset-0 opacity-55"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 14% 12%, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0) 35%), radial-gradient(circle at 88% 86%, rgba(188,154,226,0.35) 0%, rgba(188,154,226,0) 46%), linear-gradient(130deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 34%)",
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, rgba(255,255,255,0.11) 0 1px, transparent 1px 9px)",
                backgroundSize: "18px 18px",
              }}
            />
            <div className="pointer-events-none absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-white/10 to-transparent" />
            <p className="text-sm font-medium text-primary-foreground/85">Overall Revenue</p>
            <p className="mt-2 text-2xl lg:text-3xl font-bold tabular-nums">{formatInr(data.totals.overallRevenue)}</p>
            <p className="mt-3 text-xs text-primary-foreground/75">{data.totals.totalOrders} orders in selected filter</p>
          </div>
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Received</CardTitle>
                <span className="rounded-full border border-green-500/30 bg-green-500/10 p-1.5">
                  <Wallet className="h-3.5 w-3.5 text-green-700 dark:text-green-400" />
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xl lg:text-2xl font-bold text-foreground">{formatInr(data.totals.overallReceived)}</p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-green-600/80" style={{ width: `${receivedPct}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{receivedPct.toFixed(1)}% of total revenue</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Due</CardTitle>
                <span className="rounded-full border border-red-500/30 bg-red-500/10 p-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-red-700 dark:text-red-400" />
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xl lg:text-2xl font-bold text-foreground">{formatInr(data.totals.overallDue)}</p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-red-600/80" style={{ width: `${duePct}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{duePct.toFixed(1)}% of total revenue</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap">
              <div className="w-full sm:w-[200px]">
                <ListCategoryFilter
                  value={categoryId}
                  onChange={setCategoryId}
                  triggerClassName="h-10 w-full rounded-lg"
                />
              </div>
              <div className="w-full space-y-1 sm:w-[200px]">
                <Select
                  value={selectedBranchId?.toString() ?? "all"}
                  onValueChange={(v) => setSelectedBranchId(v === "all" ? null : parseInt(v, 10))}
                >
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue placeholder="All branches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All branches</SelectItem>
                    {(branchesData?.data ?? []).map((b: { id: number; name: string }) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[180px]">
                <Select
                  value={viewMode}
                  onValueChange={(v: "year" | "month") => {
                    setViewMode(v);
                    if (v === "year") {
                      setSelectedMonth("all");
                    } else if (v === "month") {
                      setSelectedYear((y) => (y === "all" ? defaultYearForMonthView(yearOptions) : y));
                    }
                  }}
                >
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue placeholder="View by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="year">Year</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[180px]">
                <Select
                  value={selectedYear}
                  onValueChange={(v) => {
                    setSelectedYear(v);
                    if (v === "all") setSelectedMonth("all");
                  }}
                >
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All years</SelectItem>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {viewMode === "month" ? (
                <div className="w-full sm:w-[180px]">
                  <Select value={selectedMonth} onValueChange={setSelectedMonth} disabled={selectedYear === "all"}>
                    <SelectTrigger className="h-10 rounded-lg">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All months</SelectItem>
                      <SelectItem value="1">January</SelectItem>
                      <SelectItem value="2">February</SelectItem>
                      <SelectItem value="3">March</SelectItem>
                      <SelectItem value="4">April</SelectItem>
                      <SelectItem value="5">May</SelectItem>
                      <SelectItem value="6">June</SelectItem>
                      <SelectItem value="7">July</SelectItem>
                      <SelectItem value="8">August</SelectItem>
                      <SelectItem value="9">September</SelectItem>
                      <SelectItem value="10">October</SelectItem>
                      <SelectItem value="11">November</SelectItem>
                      <SelectItem value="12">December</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2 sm:ml-auto">
                <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                  {dailyMode ? "Daily view active" : "Monthly view active"}
                </Badge>
                {data.filters.branchId != null ? (
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
                    Branch:{" "}
                    {(branchesData?.data ?? []).find((b: { id: number }) => b.id === data.filters.branchId)?.name ??
                      `#${data.filters.branchId}`}
                  </Badge>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>
              {dailyMode ? "Daily Revenue (Selected Month)" : "Year / Month Revenue"}
            </CardTitle>
            <Button variant="outline" size="sm" className="rounded-lg" onClick={exportMonthlyCsv}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    {dailyMode ? (
                      <>
                        <TableHead>Date</TableHead>
                        <TableHead>Day</TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead>Year</TableHead>
                        <TableHead>Month</TableHead>
                      </>
                    )}
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Due</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyMode
                    ? (data.daily ?? []).map((d) => (
                        <TableRow key={d.date}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {formatReportDateYmd(d.date)}
                          </TableCell>
                          <TableCell>{d.day}</TableCell>
                          <TableCell className="text-right font-medium">{formatInr(d.revenue)}</TableCell>
                          <TableCell className="text-right text-green-700 dark:text-green-400">{formatInr(d.received)}</TableCell>
                          <TableCell className="text-right text-red-700 dark:text-red-400">{formatInr(d.due)}</TableCell>
                          <TableCell className="text-right">{d.orders}</TableCell>
                        </TableRow>
                      ))
                    : monthlyFlat.map((m) => (
                        <TableRow key={`${m.year}-${m.month}`}>
                          <TableCell>{m.year}</TableCell>
                          <TableCell>{m.monthLabel}</TableCell>
                          <TableCell className="text-right font-medium">{formatInr(m.revenue)}</TableCell>
                          <TableCell className="text-right text-green-700 dark:text-green-400">{formatInr(m.received)}</TableCell>
                          <TableCell className="text-right text-red-700 dark:text-red-400">{formatInr(m.due)}</TableCell>
                          <TableCell className="text-right">{m.orders}</TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Category-wise Revenue</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Revenue from each order's assigned Order category only (not line-item products)
                {categoryMatrix.periodType === "day"
                  ? " · one row per day in selected month"
                  : categoryMatrix.periodType === "month"
                    ? " · one row per month in selected year"
                    : ""}
              </p>
            </div>
            <Button variant="outline" size="sm" className="rounded-lg" onClick={exportCategoryCsv}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="sticky left-0 z-10 min-w-[120px] bg-muted/30">
                      {periodColumnLabel}
                    </TableHead>
                    {categoryColumns.map((c) => (
                      <TableHead
                        key={`${c.categoryId ?? "none"}-${c.categoryName}`}
                        className="text-right whitespace-nowrap min-w-[100px]"
                      >
                        {c.categoryName}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periodRows.length === 0 || categoryColumns.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={categoryColumns.length + 1}
                        className="text-center text-muted-foreground py-8"
                      >
                        No category revenue in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {periodRows.map((row) => (
                        <TableRow key={row.key}>
                          <TableCell className="font-medium sticky left-0 z-10 bg-card whitespace-nowrap">
                            {categoryMatrix.periodType === "day"
                              ? formatReportDateYmd(row.key)
                              : row.label}
                          </TableCell>
                          {row.cells.map((amount, idx) => (
                            <TableCell
                              key={`${row.key}-${categoryColumns[idx]?.categoryId ?? idx}`}
                              className="text-right tabular-nums text-muted-foreground"
                            >
                              {amount > 0 ? formatInr(amount) : "—"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/20 font-semibold">
                        <TableCell className="sticky left-0 z-10 bg-muted/20">Total</TableCell>
                        {categoryColumns.map((c) => (
                          <TableCell
                            key={`total-${c.categoryId ?? "none"}`}
                            className="text-right tabular-nums"
                          >
                            {c.totalRevenue > 0 ? formatInr(c.totalRevenue) : "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

