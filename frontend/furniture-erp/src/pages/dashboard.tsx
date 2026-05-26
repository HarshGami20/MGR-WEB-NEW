import {
  useGetDashboardSummary,
  useGetRecentOrders,
  useGetOrderStatusBreakdown,
  useGetSalesReport,
  useListOrders,
  useListCategories,
  useListInventoryLogs,
} from "@/api-client";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { isPartnerPortalUser } from "@/lib/partner";
import PartnerDashboardPage from "@/pages/partner/dashboard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowUpRight,
  Box,
  Plus,
  ClipboardList,
  ChevronDown,
  PackageOpen,
  Activity,
  Layers,
  AlertCircle,
} from "lucide-react";
import { Link } from "wouter";
import { useMemo, useState } from "react";
import { BarChart, Bar, Cell, LabelList, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { cn } from "@/lib/utils";
import { formatInr } from "@/lib/format-currency";
import { useQuery } from "@tanstack/react-query";
import { fetchDeliverySlots } from "@/lib/delivery-api";
import { DeliveryProgressKpi } from "@/components/delivery-progress-kpi";
import { DashboardUpcomingDeliveries } from "@/components/dashboard-upcoming-deliveries";
import {
  computeDeliveryDayStats,
  localTodayYmd,
  type DeliveryOrderRow,
} from "@/lib/delivery-stats";

function statusCount(orderStatus: { status: string; count: number }[] | undefined, key: string) {
  return orderStatus?.find((s) => s.status === key)?.count ?? 0;
}

function StaffDashboard() {
  const currentYear = new Date().getFullYear();
  const [revenueYear, setRevenueYear] = useState(currentYear);
  const [kpiRange, setKpiRange] = useState<"today" | "week" | "month">("today");
  const [earningRange, setEarningRange] = useState<7 | 14 | 30>(14);
  const { selectedBranchId } = useBranch();
  const branchIdParam = selectedBranchId != null ? { branchId: selectedBranchId } : undefined;

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary(branchIdParam);
  const { data: recentOrders, isLoading: ordersLoading } = useGetRecentOrders({
    limit: 6,
    ...branchIdParam,
  });
  const { data: analyticsOrdersData, isLoading: analyticsOrdersLoading } = useListOrders({
    page: 1,
    limit: 1000,
    ...branchIdParam,
  });
  const { data: orderStatus, isLoading: statusLoading } = useGetOrderStatusBreakdown(branchIdParam);
  const { data: annualSalesReport, isLoading: annualRevenueLoading } = useGetSalesReport({
    year: revenueYear,
    ...branchIdParam,
  });
  const { data: categoriesData } = useListCategories();
  const { data: inventoryLogsData, isLoading: logsLoading } = useListInventoryLogs({
    page: 1,
    limit: 10,
  });

  const completedMain =
    statusCount(orderStatus, "complete") + statusCount(orderStatus, "delivered");
  const orderReceived = statusCount(orderStatus, "order_received");
  const manufacturing = statusCount(orderStatus, "manufacturing");
  const readyToShip = statusCount(orderStatus, "ready_to_ship");
  const cancelled = statusCount(orderStatus, "cancelled");
  const inProgress = manufacturing + readyToShip;
  const openOrders = orderReceived + inProgress;
  const fromBreakdownSum = completedMain + openOrders + cancelled;
  const totalOrders = summary?.totalOrders ?? fromBreakdownSum;

  const earningReportData = useMemo(() => {
    const orders = analyticsOrdersData?.data ?? [];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayKey = todayStart.getTime();
    return Array.from({ length: earningRange }, (_, i) => {
      const day = new Date(todayStart);
      day.setDate(todayStart.getDate() - (earningRange - 1 - i));
      const dayEnd = new Date(day);
      dayEnd.setDate(day.getDate() + 1);
      const bucket = orders.filter((o) => {
        const dt = new Date(o.createdAt);
        return dt >= day && dt < dayEnd;
      });
      const revenue = bucket.reduce((sum, o) => sum + o.totalAmount, 0);
      return {
        key: day.getTime(),
        label: day.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
        tooltipLabel: day.toLocaleDateString(undefined, {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
        revenue,
        isToday: day.getTime() === todayKey,
      };
    });
  }, [analyticsOrdersData?.data, earningRange]);

  const earningTotal = earningReportData.reduce((sum, d) => sum + d.revenue, 0);
  const earningMax = earningReportData.reduce((max, d) => (d.revenue > max ? d.revenue : max), 0);

  const allOrdersForStats = analyticsOrdersData?.data ?? [];

  const kpiBreakdown = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dow = todayStart.getDay();
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - dow);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const rangeStart =
      kpiRange === "today" ? todayStart : kpiRange === "week" ? weekStart : monthStart;
    let total = 0;
    let delivered = 0;
    let inProgress = 0;
    let received = 0;
    let cancelled = 0;
    let revenueTotal = 0;
    let revenuePaid = 0;
    let revenueDue = 0;
    for (const o of allOrdersForStats) {
      const dt = new Date(o.createdAt);
      if (dt < rangeStart) continue;
      total++;
      const st = String(o.status);
      if (st === "delivered" || st === "complete") delivered++;
      else if (st === "manufacturing" || st === "ready_to_ship") inProgress++;
      else if (st === "order_received") received++;
      else if (st === "cancelled") cancelled++;
      const totalAmt = (o as any).totalAmount ?? 0;
      const paidAmt = (o as any).paidAmount ?? 0;
      revenueTotal += totalAmt;
      revenuePaid += paidAmt;
      revenueDue += Math.max(totalAmt - paidAmt, 0);
    }
    return { total, delivered, inProgress, received, cancelled, revenueTotal, revenuePaid, revenueDue };
  }, [allOrdersForStats, kpiRange]);

  const revenueBarData = useMemo(
    () => [
      { name: "Due", value: kpiBreakdown.revenueDue, fill: "hsl(var(--chart-3))" },
      { name: "Received", value: kpiBreakdown.revenuePaid, fill: "hsl(var(--chart-1))" },
      { name: "Total", value: kpiBreakdown.revenueTotal, fill: "hsl(var(--chart-2))" },
    ],
    [kpiBreakdown.revenueDue, kpiBreakdown.revenuePaid, kpiBreakdown.revenueTotal],
  );

  const yearOptions = useMemo(
    () => Array.from({ length: 6 }, (_, idx) => currentYear - idx),
    [currentYear],
  );
  const annualRevenue = annualSalesReport?.reduce((sum, item) => sum + item.revenue, 0) ?? 0;
  const quarterTotals = useMemo(() => {
    const rows = annualSalesReport ?? [];
    if (!rows.length) return [0, 0, 0, 0];
    if (rows.length >= 12) {
      return [0, 1, 2, 3].map((q) =>
        rows.slice(q * 3, q * 3 + 3).reduce((sum, row) => sum + row.revenue, 0),
      );
    }
    const chunkSize = Math.ceil(rows.length / 4);
    return [0, 1, 2, 3].map((q) =>
      rows.slice(q * chunkSize, q * chunkSize + chunkSize).reduce((sum, row) => sum + row.revenue, 0),
    );
  }, [annualSalesReport]);

  const categoryRevenue = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const categoryMap = new Map<number, string>();
    for (const c of categoriesData ?? []) {
      categoryMap.set(c.id, c.name);
    }
    const buckets = new Map<string, number>();
    for (const o of allOrdersForStats) {
      const dt = new Date(o.createdAt);
      if (dt < monthStart || dt >= monthEnd) continue;
      const items = ((o as any).items ?? []) as Array<{
        totalPrice?: number;
        unitPrice?: number;
        quantity?: number;
        product?: { categoryId?: number | null; categoryPath?: string | null; category?: { name?: string } | null } | null;
      }>;
      for (const item of items) {
        const lineTotal =
          item.totalPrice ?? (item.unitPrice ?? 0) * (item.quantity ?? 0);
        const name =
          item.product?.categoryPath ||
          item.product?.category?.name ||
          (item.product?.categoryId != null ? categoryMap.get(item.product.categoryId) : null) ||
          "Uncategorised";
        buckets.set(name, (buckets.get(name) ?? 0) + lineTotal);
      }
    }
    return Array.from(buckets.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [allOrdersForStats, categoriesData]);

  const categoryRevenueTotal = categoryRevenue.reduce((sum, c) => sum + c.value, 0);

  const paymentReminders = useMemo(() => {
    return allOrdersForStats
      .map((o) => {
        const total = (o as any).totalAmount ?? 0;
        const paid = (o as any).paidAmount ?? 0;
        const dueAmount = Math.max(total - paid, 0);
        return { order: o, dueAmount };
      })
      .filter(
        (row) =>
          row.dueAmount > 0 &&
          String(row.order.status) !== "cancelled",
      )
      .sort(
        (a, b) =>
          new Date(a.order.createdAt).getTime() - new Date(b.order.createdAt).getTime(),
      )
      .slice(0, 6);
  }, [allOrdersForStats]);

  const loadingBlock = summaryLoading || statusLoading;
  const todayYmd = localTodayYmd();
  const deliveryOrders = (analyticsOrdersData?.data ?? []) as DeliveryOrderRow[];
  const { data: todaySlots = [], isLoading: todaySlotsLoading } = useQuery({
    queryKey: ["deliverySlots", selectedBranchId, todayYmd, todayYmd],
    queryFn: () =>
      fetchDeliverySlots({
        branchId: selectedBranchId!,
        from: todayYmd,
        to: todayYmd,
      }),
    enabled: selectedBranchId != null,
  });
  const todaySlotCapacity = todaySlots.reduce((sum, s) => sum + s.maxOrders, 0);
  const todayDeliveryStats = computeDeliveryDayStats(
    deliveryOrders,
    todayYmd,
    todaySlotCapacity || 0,
  );
  const iconForOrder = (st: string) => {
    const map: Record<string, typeof Box> = {
      order_received: ClipboardList,
      manufacturing: ClipboardList,
      ready_to_ship: Box,
      complete: Box,
      delivered: Box,
      cancelled: ClipboardList,
    };
    const Cmp = map[st] ?? Box;
    return Cmp;
  };

  const orderStatusChip = (status: string) => {
    switch (status) {
      case "order_received":
        return <Badge variant="outline" className="rounded-full border-yellow-200 bg-yellow-50 text-yellow-700">Order Received</Badge>;
      case "manufacturing":
        return <Badge variant="outline" className="rounded-full border-blue-200 bg-blue-50 text-blue-700">Manufacturing</Badge>;
      case "ready_to_ship":
        return <Badge variant="outline" className="rounded-full border-indigo-200 bg-indigo-50 text-indigo-700">Ready To Ship</Badge>;
      case "complete":
        return <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/5 text-primary">Complete</Badge>;
      case "delivered":
        return <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/5 text-primary">Complete</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="rounded-full border-rose-200 bg-rose-50 text-rose-700">Cancelled</Badge>;
      default:
        return <Badge variant="outline" className="rounded-full capitalize">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1600px]">
      {/* Title row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            Today's orders, revenue & fulfilment at a glance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <Button asChild size="lg" className="rounded-xl px-5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md">
            <Link href="/orders">
              <Plus className="h-4 w-4 mr-1" aria-hidden />
              New order
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-xl  px-5 border-primary/25 bg-background">
            <Link href="/products">
              <Box className="h-4 w-4 mr-1" aria-hidden />
              Product
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI strip with Today/Week/Month filter */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Total Orders</h2>
            <span className="text-xs text-muted-foreground capitalize">
              {kpiRange === "today" ? "Today" : kpiRange === "week" ? "This week" : "This month"}
            </span>
          </div>
          <div className="inline-flex rounded-xl border border-border bg-background p-1 text-xs">
            {([
              { key: "today", label: "Today" },
              { key: "week", label: "This Week" },
              { key: "month", label: "This Month" },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setKpiRange(opt.key)}
                className={cn(
                  "px-3 py-1 rounded-lg transition-colors",
                  kpiRange === opt.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loadingBlock || analyticsOrdersLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[132px] rounded-3xl" />
            ))
          ) : (
            <>
              <div className="rounded-3xl bg-[linear-gradient(145deg,hsl(var(--primary))_0%,hsl(var(--primary-dim))_42%,hsl(var(--primary-deep))_100%)] text-primary-foreground p-6 shadow-[0_14px_34px_rgba(56,39,67,0.28)] relative overflow-hidden border border-primary/15">
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
                <div className="absolute right-4 top-4 opacity-20">
                  <ArrowUpRight className="h-8 w-8" aria-hidden />
                </div>
                <p className="text-sm font-medium text-primary-foreground/85">Total orders</p>
                <p className="mt-2 text-4xl font-bold tabular-nums">{kpiBreakdown.total}</p>
                <p className="mt-3 text-xs text-primary-foreground/75">
                  {kpiRange === "today"
                    ? `${summary?.completedOrdersToday ?? 0} completed today`
                    : `${kpiBreakdown.delivered} completed in range`}
                </p>
              </div>
              <MetricCardPlain
                title="Delivered"
                value={kpiBreakdown.delivered}
                hint={
                  kpiBreakdown.total > 0
                    ? `${Math.round((kpiBreakdown.delivered / kpiBreakdown.total) * 100)}% of pipeline`
                    : "No orders yet"
                }
              />
              <MetricCardPlain
                title="In progress"
                value={kpiBreakdown.inProgress}
                hint="Manufacturing + ready to ship"
              />
              <MetricCardPlain
                title="Order received"
                value={kpiBreakdown.received}
                hint={kpiBreakdown.cancelled > 0 ? `${kpiBreakdown.cancelled} cancelled in mix` : "Needs action"}
              />
            </>
          )}
        </div>
      </section>

      {/* Total Revenue 3-bar chart + Annual Revenue rings */}
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-8 rounded-3xl border border-border bg-card p-5 md:p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Total Revenue</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Due, received & total revenue — {kpiRange === "today" ? "today" : kpiRange === "week" ? "this week" : "this month"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-xl text-xs">
                Total ₹{formatCompactCurrency(kpiBreakdown.revenueTotal)}
              </Badge>
              <Badge variant="outline" className="rounded-xl text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                Received ₹{formatCompactCurrency(kpiBreakdown.revenuePaid)}
              </Badge>
              <Badge variant="outline" className="rounded-xl text-xs bg-amber-50 text-amber-700 border-amber-200">
                Due ₹{formatCompactCurrency(kpiBreakdown.revenueDue)}
              </Badge>
            </div>
          </div>
          <div className="h-[260px] w-full mt-4">
            {analyticsOrdersLoading ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                Loading revenue…
              </div>
            ) : kpiBreakdown.revenueTotal === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm border border-dashed rounded-xl">
                No revenue recorded for the selected range
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={revenueBarData}
                  layout="vertical"
                  margin={{ top: 8, bottom: 8, left: 12, right: 24 }}
                  barCategoryGap="28%"
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickFormatter={(v) => `₹${formatCompactCurrency(v)}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    width={80}
                    tick={{ fill: "hsl(var(--foreground))", fontSize: 13, fontWeight: 600 }}
                  />
                  <RechartsTooltip
                    cursor={{ fill: "hsl(var(--accent))", radius: 12 }}
                    content={({
                      payload,
                    }: {
                      payload?: Array<{ payload: { name: string; value: number } }>;
                    }) =>
                      payload?.length ? (
                        <div className="rounded-2xl border bg-card px-3 py-2 text-sm shadow-md">
                          <p className="font-semibold">{payload[0]?.payload.name}</p>
                          <p className="text-muted-foreground mt-1">
                            <span className="font-medium text-foreground">
                              {formatInr(payload[0]?.payload.value ?? 0)}
                            </span>
                          </p>
                        </div>
                      ) : null
                    }
                  />
                  <Bar dataKey="value" radius={[0, 12, 12, 0]} maxBarSize={40}>
                    {revenueBarData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="right"
                      formatter={(v: number) => (v > 0 ? `₹${formatCompactCurrency(v)}` : "")}
                      style={{ fill: "hsl(var(--foreground))", fontSize: 12, fontWeight: 600 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 md:p-6 min-h-[320px] shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold tracking-tight text-foreground">Annual revenue</p>
              <div className="relative">
                <select
                  value={revenueYear}
                  onChange={(e) => setRevenueYear(Number(e.target.value))}
                  className="appearance-none rounded-xl border border-border bg-background pl-3 pr-8 py-1 text-xs text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  aria-label="Filter annual revenue by year"
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            <TooltipProvider>
              <div className="relative mt-6 h-[232px]">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="absolute left-1/2 bottom-0 -translate-x-1/2 h-[220px] w-[220px] rounded-full bg-brand-200/26 transition-transform duration-300 hover:scale-[1.03] z-10 cursor-default">
                      <p className="absolute left-1/2 top-[7%] -translate-x-1/2 text-sm font-semibold text-foreground">
                        ₹{formatCompactCurrency(quarterTotals[0])}
                      </p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">Q1 revenue: {formatInr(quarterTotals[0])}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="absolute left-1/2 bottom-0 -translate-x-1/2 h-[176px] w-[176px] rounded-full bg-brand-300/30 transition-transform duration-300 hover:scale-[1.04] z-20 cursor-default">
                      <p className="absolute left-1/2 top-[8%] -translate-x-1/2 text-sm font-semibold text-foreground">
                        ₹{formatCompactCurrency(quarterTotals[1])}
                      </p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">Q2 revenue: {formatInr(quarterTotals[1])}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="absolute left-1/2 bottom-0 -translate-x-1/2 h-[136px] w-[136px] rounded-full bg-brand-400/34 transition-transform duration-300 hover:scale-[1.05] z-30 cursor-default">
                      <p className="absolute left-1/2 top-[10%] -translate-x-1/2 text-sm font-semibold text-foreground">
                        ₹{formatCompactCurrency(quarterTotals[2])}
                      </p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">Q3 revenue: {formatInr(quarterTotals[2])}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="absolute left-1/2 bottom-0 -translate-x-1/2 h-[88px] w-[88px] rounded-full bg-brand-600 shadow-md transition-transform duration-300 hover:scale-[1.08] z-40 cursor-default">
                      <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[1.23rem] font-bold leading-none tracking-tight text-white">
                        ₹{formatCompactCurrency(annualRevenue)}
                      </p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">Full year total revenue: {formatInr(annualRevenue)}</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
            <p className="text-xs text-muted-foreground mt-1">
              {annualRevenueLoading
                ? "Loading year revenue from database..."
                : annualSalesReport?.length
                  ? `Showing ${annualSalesReport.length} period(s) from ${revenueYear}.`
                  : `No sales data found for ${revenueYear}.`}
            </p>
          </div>
        </div>
      </div>


      <div className="rounded-3xl border border-border bg-card p-5 md:p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Earning Reports</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Daily income overview · Last {earningRange} days
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-border bg-background p-1 text-xs">
              {[7, 14, 30].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setEarningRange(value as 7 | 14 | 30)}
                  className={cn(
                    "px-3 py-1 rounded-lg transition-colors",
                    earningRange === value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {value}d
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Income</p>
            <p className="mt-1 text-xl font-bold text-primary tabular-nums">
              ₹{formatCompactCurrency(earningTotal)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Total for selected range</p>
          </div>
          <div className="rounded-2xl border border-border bg-background px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Best day</p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              ₹{formatCompactCurrency(earningMax)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Highest single-day income</p>
          </div>
        </div>

        <div className="h-[320px] w-full mt-5">
          {analyticsOrdersLoading ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Loading earnings…
            </div>
          ) : earningTotal === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm border border-dashed rounded-xl">
              No income recorded in the last {earningRange} days
            </div> 
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={earningReportData}                      
                barCategoryGap={earningRange === 30 ? "10%" : "22%"}
                margin={{ top: 28, bottom: 0, left: 0, right: 8 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  interval={earningRange === 30 ? "preserveStartEnd" : 0}
                  minTickGap={earningRange === 30 ? 12 : 4}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickFormatter={(v) => `₹${formatCompactCurrency(v)}`}
                />
                <RechartsTooltip
                  cursor={{ fill: "hsl(var(--accent))", radius: 12 }}
                  content={({
                    payload,
                  }: {
                    payload?: Array<{ payload: { tooltipLabel: string; revenue: number } }>;
                  }) =>
                    payload?.length ? (
                      <div className="rounded-2xl border bg-card px-3 py-2 text-sm shadow-md">
                        <p className="font-semibold">{payload[0]?.payload.tooltipLabel}</p>
                        <p className="text-muted-foreground mt-1">
                          Income:{" "}
                          <span className="font-medium text-foreground">
                            {formatInr(payload[0]?.payload.revenue ?? 0)}
                          </span>
                        </p>
                      </div>
                    ) : null
                  }
                />
                <Bar
                  dataKey="revenue"
                  name="Income"
                  radius={[12, 12, 0, 0]}
                  maxBarSize={earningRange === 30 ? 18 : 32}
                >
                  {earningReportData.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={
                        entry.isToday
                          ? "hsl(var(--chart-1))"
                          : "hsl(var(--chart-1) / 0.25)"
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="revenue"
                    position="top"
                    formatter={(v: number) => (v > 0 ? `₹${formatCompactCurrency(v)}` : "")}
                    style={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Revenue by Categories + Recent Orders */}
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-7 rounded-3xl border border-border bg-card p-5 md:p-6 shadow-sm">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" aria-hidden />
                Revenue by Categories
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">Current month · Top categories</p>
            </div>
            <Badge variant="outline" className="rounded-xl text-xs">
              ₹{formatCompactCurrency(categoryRevenueTotal)}
            </Badge>
          </div>
          {analyticsOrdersLoading ? (
            <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">
              Loading categories…
            </div>
          ) : categoryRevenue.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm border border-dashed rounded-xl">
              No category revenue recorded for this month
            </div>
          ) : (
            <ul className="space-y-3">
              {categoryRevenue.map((row, idx) => {
                const pct = categoryRevenueTotal > 0 ? (row.value / categoryRevenueTotal) * 100 : 0;
                return (
                  <li key={`${row.name}-${idx}`} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate max-w-[60%]">{row.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        ₹{formatCompactCurrency(row.value)} <span className="text-xs opacity-70">({pct.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="lg:col-span-5 rounded-3xl border border-border bg-card p-5 md:p-6 shadow-sm flex flex-col min-h-[320px]">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <PackageOpen className="h-4 w-4 text-primary" aria-hidden />
              Recent Orders
            </h2>
            <Button variant="outline" size="sm" className="rounded-xl h-7 text-xs border-primary/20" asChild>
              <Link href="/orders">+ New</Link>
            </Button>
          </div>
          <ul className="space-y-3 flex-1 overflow-auto pr-1">
            {ordersLoading ? (
              <li className="text-muted-foreground text-sm py-10 text-center">Loading…</li>
            ) : !recentOrders?.length ? (
              <li className="text-muted-foreground text-sm py-10 text-center">No orders yet</li>
            ) : (
              recentOrders.slice(0, 7).map((order) => {
                const Icon = iconForOrder(order.status);
                return (
                  <li key={order.id}>
                    <Link
                      href="/orders"
                      className={cn(
                        "flex gap-3 rounded-2xl border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted/40",
                      )}
                    >
                      <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                        <Icon className="h-5 w-5 opacity-90" aria-hidden />
                      </div>
                      <div className="min-w-0 w-full flex justify-between gap-2">
                        <div className="grid">
                          <p className="text-sm font-medium truncate">{order.customerName}</p>
                          <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{order.orderNumber}</p>
                        </div>
                        <div className="mt-2">{orderStatusChip(order.status)}</div>
                      </div>
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>

      {/* Delivery Actions */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Delivery Actions</h2>
          <span className="text-xs text-muted-foreground">Today's progress and upcoming deliveries</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
          <div className="lg:col-span-6">
            <DeliveryProgressKpi
              stats={todayDeliveryStats}
              loading={analyticsOrdersLoading || todaySlotsLoading}
            />
          </div>
          <div className="lg:col-span-6 rounded-3xl border border-border bg-card p-5 md:p-6 shadow-sm">
            <DashboardUpcomingDeliveries
              orders={deliveryOrders}
              loading={analyticsOrdersLoading}
            />
          </div>
        </div>
      </section>

      {/* Payment Reminders + Logs */}
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-7 rounded-3xl border border-border bg-card p-5 md:p-6 shadow-sm">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" aria-hidden />
                Payment Reminders
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Orders with outstanding balance · Oldest first
              </p>
            </div>
            <Badge variant="outline" className="rounded-xl text-xs">
              {paymentReminders.length} pending
            </Badge>
          </div>
          {analyticsOrdersLoading ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
              Loading…
            </div>
          ) : paymentReminders.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm border border-dashed rounded-xl">
              No outstanding payments — you're all caught up.
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {paymentReminders.map(({ order, dueAmount }) => {
                const orderAny = order as any;
                const createdAt = new Date(order.createdAt);
                const ageDays = Math.max(
                  0,
                  Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)),
                );
                return (
                  <li key={order.id} className="py-2.5">
                    <Link
                      href="/orders"
                      className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 hover:bg-muted/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {orderAny.customerName ?? "Customer"}
                        </p>
                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                          {orderAny.orderNumber} · {ageDays}d old
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums text-amber-700">
                          ₹{formatCompactCurrency(dueAmount)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          of ₹{formatCompactCurrency(orderAny.totalAmount ?? 0)}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="lg:col-span-5 rounded-3xl border border-border bg-card p-5 md:p-6 shadow-sm">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" aria-hidden />
                Logs
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">Latest inventory activity</p>
            </div>
            <Button variant="outline" size="sm" className="rounded-xl h-7 text-xs border-primary/20" asChild>
              <Link href="/inventory">View all</Link>
            </Button>
          </div>
          {logsLoading ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
              Loading…
            </div>
          ) : !inventoryLogsData?.data?.length ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm border border-dashed rounded-xl">
              No recent inventory activity
            </div>
          ) : (
            <ul className="space-y-2.5">
              {inventoryLogsData.data.slice(0, 7).map((log) => {
                const productName = log.product?.name ?? `Product #${log.productId}`;
                const variantName = log.variant?.name ? ` · ${log.variant.name}` : "";
                const created = new Date(log.createdAt);
                const ago = relativeTimeFromNow(created);
                const typeChip =
                  log.type === "in" ? (
                    <Badge className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2 py-0">
                      +{log.quantity}
                    </Badge>
                  ) : log.type === "out" ? (
                    <Badge className="rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] px-2 py-0">
                      -{log.quantity}
                    </Badge>
                  ) : (
                    <Badge className="rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] px-2 py-0">
                      Adj {log.quantity}
                    </Badge>
                  );
                return (
                  <li key={log.id} className="flex items-center gap-3 text-sm">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                      <Box className="h-4 w-4" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {productName}
                        {variantName}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{ago}</p>
                    </div>
                    {typeChip}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

    </div>
  );
}

type KpiTone = "primary" | "info" | "accent" | "success" | "warning";

function KpiCard({
  tone,
  icon,
  label,
  value,
  hint,
}: {
  tone: KpiTone;
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  const toneClass: Record<KpiTone, string> = {
    primary:
      "bg-[linear-gradient(145deg,hsl(var(--primary))_0%,hsl(var(--primary-dim))_45%,hsl(var(--primary-deep))_100%)] text-primary-foreground border-primary/20 shadow-[0_14px_34px_rgba(56,39,67,0.22)]",
    info: "bg-card border-border text-card-foreground",
    accent: "bg-card border-border text-card-foreground",
    success: "bg-emerald-50 border-emerald-200 text-emerald-900",
    warning: "bg-amber-50 border-amber-200 text-amber-900",
  };
  const iconBg: Record<KpiTone, string> = {
    primary: "bg-white/15 text-primary-foreground",
    info: "bg-primary/10 text-primary",
    accent: "bg-primary/10 text-primary",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
  };
  const labelClass: Record<KpiTone, string> = {
    primary: "text-primary-foreground/80",
    info: "text-muted-foreground",
    accent: "text-muted-foreground",
    success: "text-emerald-700",
    warning: "text-amber-700",
  };
  const hintClass: Record<KpiTone, string> = {
    primary: "text-primary-foreground/75",
    info: "text-muted-foreground",
    accent: "text-muted-foreground",
    success: "text-emerald-700/80",
    warning: "text-amber-700/80",
  };
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border p-5 md:p-6 transition-shadow hover:shadow-md",
        toneClass[tone],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("text-xs font-medium uppercase tracking-wide", labelClass[tone])}>{label}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums leading-tight truncate">{value}</p>
          {hint ? <p className={cn("mt-2 text-xs leading-snug", hintClass[tone])}>{hint}</p> : null}
        </div>
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", iconBg[tone])}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function relativeTimeFromNow(date: Date) {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatCompactCurrency(value: number) {
  if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return `${Math.round(value)}`;
}

function MetricCardPlain({
  title,
  value,
  hint,
}: {
  title: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="mt-3 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default function Dashboard() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="space-y-6 p-1 max-w-[1600px]">
        <div className="h-10 w-64 rounded-full bg-muted animate-pulse" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-3xl bg-muted animate-pulse" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-72 rounded-3xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }
  if (user && isPartnerPortalUser(user)) {
    return <PartnerDashboardPage />;
  }
  return <StaffDashboard />;
}
