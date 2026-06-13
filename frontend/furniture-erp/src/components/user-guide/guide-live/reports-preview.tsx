import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GuideTarget } from "@/components/user-guide/guide-target";
import { DUMMY } from "@/lib/user-guide/mock-data";
import { AlertCircle, Download, Wallet } from "lucide-react";

type ReportsPreviewProps = {
  screenId: string;
  activeHighlight: string | null;
};

function formatInr(amount: number) {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

function ReportsPageShell({
  activeHighlight,
  dailyMode = false,
  showOrdersExport = false,
  children,
}: {
  activeHighlight: string | null;
  dailyMode?: boolean;
  showOrdersExport?: boolean;
  children?: React.ReactNode;
}) {
  const t = DUMMY.reports.totals;

  return (
    <div className="space-y-6 pointer-events-none select-none text-sm" aria-hidden>
      <GuideTarget id="page-header" activeHighlight={activeHighlight} label="Revenue Reports">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Revenue Reports</h2>
            <p className="text-muted-foreground">
              Revenue, received and due analysis by month/day with category breakdown.
            </p>
          </div>
          <GuideTarget
            id="header-action-export-orders"
            activeHighlight={activeHighlight}
            label="Export to Excel"
            dimOthers={false}
          >
            <Button type="button" variant="outline" disabled>
              <Download className="mr-2 h-4 w-4" />
              Export to Excel
            </Button>
          </GuideTarget>
        </div>
      </GuideTarget>

      <GuideTarget id="kpi-cards" activeHighlight={activeHighlight} label="Summary KPI cards">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-primary p-6 text-primary-foreground shadow-lg">
            <p className="text-sm font-medium text-primary-foreground/85">Overall Revenue</p>
            <p className="mt-2 text-2xl lg:text-3xl font-bold tabular-nums">{formatInr(t.overallRevenue)}</p>
            <p className="mt-3 text-xs text-primary-foreground/75">{t.totalOrders} orders in selected filter</p>
          </div>
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Received</CardTitle>
                <span className="rounded-full border border-green-500/30 bg-green-500/10 p-1.5">
                  <Wallet className="h-3.5 w-3.5 text-green-700" />
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xl lg:text-2xl font-bold">{formatInr(t.overallReceived)}</p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-green-600/80" style={{ width: `${t.receivedPct}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t.receivedPct}% of total revenue</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Due</CardTitle>
                <span className="rounded-full border border-red-500/30 bg-red-500/10 p-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-red-700" />
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xl lg:text-2xl font-bold">{formatInr(t.overallDue)}</p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-red-600/80" style={{ width: `${t.duePct}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t.duePct}% of total revenue</p>
            </CardContent>
          </Card>
        </div>
      </GuideTarget>

      <ReportFiltersBar activeHighlight={activeHighlight} dailyMode={dailyMode} />

      {children}

      {showOrdersExport ? <OrdersExportDialog activeHighlight={activeHighlight} /> : null}
    </div>
  );
}

function ReportFiltersBar({
  activeHighlight,
  dailyMode,
}: {
  activeHighlight: string | null;
  dailyMode: boolean;
}) {
  return (
    <GuideTarget id="report-filters" activeHighlight={activeHighlight} label="Report filters">
      <Card className="border-border/70 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap">
            <GuideTarget id="filter-view-mode" activeHighlight={activeHighlight} label="View by" dimOthers={false}>
              <div className="h-10 w-full sm:w-[180px] rounded-lg border bg-background px-3 flex items-center text-sm">
                {dailyMode ? "Monthly" : "Monthly"}
              </div>
            </GuideTarget>
            {dailyMode ? (
              <GuideTarget id="filter-month" activeHighlight={activeHighlight} label="Month" dimOthers={false}>
                <div className="h-10 w-full sm:w-[180px] rounded-lg border bg-background px-3 flex items-center text-sm">
                  June
                </div>
              </GuideTarget>
            ) : null}
            <GuideTarget id="filter-year" activeHighlight={activeHighlight} label="Year" dimOthers={false}>
              <div className="h-10 w-full sm:w-[180px] rounded-lg border bg-background px-3 flex items-center text-sm">
                2026
              </div>
            </GuideTarget>
            <GuideTarget id="filter-category" activeHighlight={activeHighlight} label="Category" dimOthers={false}>
              <div className="h-10 w-full sm:w-[200px] rounded-lg border bg-background px-3 flex items-center text-xs text-muted-foreground">
                Category · All
              </div>
            </GuideTarget>
            <GuideTarget id="filter-branch" activeHighlight={activeHighlight} label="Branch" dimOthers={false}>
              <div className="h-10 w-full sm:w-[200px] rounded-lg border bg-background px-3 flex items-center text-sm">
                {DUMMY.branchName}
              </div>
            </GuideTarget>
            <GuideTarget id="view-mode-badges" activeHighlight={activeHighlight} label="Active view badges" dimOthers={false}>
              <div className="flex flex-wrap gap-2 sm:ml-auto">
                <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                  {dailyMode ? "Daily view active" : "Monthly view active"}
                </Badge>
                <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
                  Branch: {DUMMY.branchName}
                </Badge>
              </div>
            </GuideTarget>
          </div>
        </CardContent>
      </Card>
    </GuideTarget>
  );
}

function RevenueTableCard({
  activeHighlight,
  dailyMode,
}: {
  activeHighlight: string | null;
  dailyMode: boolean;
}) {
  return (
    <GuideTarget id="revenue-table" activeHighlight={activeHighlight} label="Revenue table">
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{dailyMode ? "Daily Revenue (Selected Month)" : "Year / Month Revenue"}</CardTitle>
          <GuideTarget id="revenue-export-csv" activeHighlight={activeHighlight} label="Export CSV" dimOthers={false}>
            <Button variant="outline" size="sm" className="rounded-lg" disabled>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </GuideTarget>
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
                  ? DUMMY.reports.dailyRows.map((row) => (
                      <TableRow key={row.date}>
                        <TableCell className="font-medium whitespace-nowrap">{row.date}</TableCell>
                        <TableCell>{row.day}</TableCell>
                        <TableCell className="text-right font-medium">{formatInr(row.revenue)}</TableCell>
                        <TableCell className="text-right text-green-700">{formatInr(row.received)}</TableCell>
                        <TableCell className="text-right text-red-700">{formatInr(row.due)}</TableCell>
                        <TableCell className="text-right">{row.orders}</TableCell>
                      </TableRow>
                    ))
                  : DUMMY.reports.monthlyRows.map((row) => (
                      <TableRow key={`${row.year}-${row.month}`}>
                        <TableCell>{row.year}</TableCell>
                        <TableCell>{row.month}</TableCell>
                        <TableCell className="text-right font-medium">{formatInr(row.revenue)}</TableCell>
                        <TableCell className="text-right text-green-700">{formatInr(row.received)}</TableCell>
                        <TableCell className="text-right text-red-700">{formatInr(row.due)}</TableCell>
                        <TableCell className="text-right">{row.orders}</TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </GuideTarget>
  );
}

function CategoryRevenueTable({ activeHighlight }: { activeHighlight: string | null }) {
  const cols = DUMMY.reports.categoryColumns;

  return (
    <GuideTarget id="category-table" activeHighlight={activeHighlight} label="Category-wise revenue">
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Category-wise Revenue</CardTitle>
          <GuideTarget id="category-export-csv" activeHighlight={activeHighlight} label="Export CSV" dimOthers={false}>
            <Button variant="outline" size="sm" className="rounded-lg" disabled>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </GuideTarget>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="sticky left-0 z-10 min-w-[120px] bg-muted/30">Month</TableHead>
                  {cols.map((name) => (
                    <TableHead key={name} className="text-right whitespace-nowrap min-w-[100px]">
                      {name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {DUMMY.reports.categoryPeriodRows.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="font-medium sticky left-0 z-10 bg-card whitespace-nowrap">
                      {row.label}
                    </TableCell>
                    {row.cells.map((amount, idx) => (
                      <TableCell key={idx} className="text-right tabular-nums text-muted-foreground">
                        {amount > 0 ? formatInr(amount) : "—"}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                <TableRow className="bg-muted/20 font-semibold">
                  <TableCell className="sticky left-0 z-10 bg-muted/20">Total</TableCell>
                  {DUMMY.reports.categoryTotals.map((total, idx) => (
                    <TableCell key={idx} className="text-right tabular-nums">
                      {formatInr(total)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </GuideTarget>
  );
}

function OrdersExportDialog({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <GuideTarget id="orders-export-dialog" activeHighlight={activeHighlight} label="Export Orders dialog">
      <div className="rounded-lg border bg-card shadow-lg p-6 max-w-[500px] mx-auto mt-6 space-y-4">
        <div>
          <p className="font-semibold">Export Orders to Excel</p>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a filter option to export orders with full details.
          </p>
        </div>

        <GuideTarget id="export-date-filter" activeHighlight={activeHighlight} label="Date filter" dimOthers={false}>
          <div className="space-y-2">
            <Label>Date filter</Label>
            <div className="h-9 rounded-md border bg-background px-3 flex items-center text-sm">Year · 2026</div>
          </div>
        </GuideTarget>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <GuideTarget id="export-branch" activeHighlight={activeHighlight} label="Branch" dimOthers={false}>
            <div className="space-y-2">
              <Label>Branch</Label>
              <div className="h-9 rounded-md border bg-background px-3 flex items-center text-sm">
                {DUMMY.branchName}
              </div>
            </div>
          </GuideTarget>
          <GuideTarget id="export-category" activeHighlight={activeHighlight} label="Category" dimOthers={false}>
            <div className="space-y-2">
              <Label>Category</Label>
              <div className="h-9 rounded-md border bg-background px-3 flex items-center text-xs text-muted-foreground">
                Category · All
              </div>
            </div>
          </GuideTarget>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" disabled>
            Cancel
          </Button>
          <GuideTarget id="export-save" activeHighlight={activeHighlight} label="Export" dimOthers={false}>
            <Button type="button" disabled>
              Export
            </Button>
          </GuideTarget>
        </div>
      </div>
    </GuideTarget>
  );
}

export function GuideLiveReportsPreview({ screenId, activeHighlight }: ReportsPreviewProps) {
  if (screenId === "reports-overview" || screenId === "reports-hub") {
    return (
      <ReportsPageShell activeHighlight={activeHighlight}>
        <RevenueTableCard activeHighlight={activeHighlight} dailyMode={false} />
        <CategoryRevenueTable activeHighlight={activeHighlight} />
      </ReportsPageShell>
    );
  }

  if (screenId === "reports-revenue") {
    return (
      <ReportsPageShell activeHighlight={activeHighlight}>
        <RevenueTableCard activeHighlight={activeHighlight} dailyMode={false} />
      </ReportsPageShell>
    );
  }

  if (screenId === "reports-daily") {
    return (
      <ReportsPageShell activeHighlight={activeHighlight} dailyMode>
        <RevenueTableCard activeHighlight={activeHighlight} dailyMode />
      </ReportsPageShell>
    );
  }

  if (screenId === "reports-category") {
    return (
      <ReportsPageShell activeHighlight={activeHighlight}>
        <CategoryRevenueTable activeHighlight={activeHighlight} />
      </ReportsPageShell>
    );
  }

  if (screenId === "reports-export-orders") {
    return (
      <ReportsPageShell activeHighlight={activeHighlight} showOrdersExport>
        <RevenueTableCard activeHighlight={activeHighlight} dailyMode={false} />
      </ReportsPageShell>
    );
  }

  return (
    <ReportsPageShell activeHighlight={activeHighlight}>
      <RevenueTableCard activeHighlight={activeHighlight} dailyMode={false} />
      <CategoryRevenueTable activeHighlight={activeHighlight} />
    </ReportsPageShell>
  );
}
