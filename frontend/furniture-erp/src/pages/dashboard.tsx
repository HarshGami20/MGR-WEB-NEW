import {
  useGetDashboardSummary,
  useGetRecentOrders,
  useGetSalesReport,
  useGetOrderStatusBreakdown,
  useListOrders,
  useListUsers,
  type User,
} from "@/api-client";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { isPartnerPortalUser } from "@/lib/partner";
import PartnerDashboardPage from "@/pages/partner/dashboard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowUpRight,
  Box,
  CalendarClock,
  Download,
  Plus,
  Video,
  ClipboardList,
  ChevronDown,
} from "lucide-react";
import { Link } from "wouter";
import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
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

const chartOrders = "hsl(var(--chart-1))";
const chartRevenue = "hsl(var(--chart-2))";
const chartPending = "hsl(var(--chart-3))";

function statusCount(orderStatus: { status: string; count: number }[] | undefined, key: string) {
  return orderStatus?.find((s) => s.status === key)?.count ?? 0;
}

function StaffDashboard() {
  const currentYear = new Date().getFullYear();
  const [revenueYear, setRevenueYear] = useState(currentYear);
  const [analyticsRange, setAnalyticsRange] = useState<"week" | "month" | "year">("month");
  const { selectedBranchId } = useBranch();
  const branchIdParam = selectedBranchId != null ? { branchId: selectedBranchId } : undefined;

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary(branchIdParam);
  const { data: recentOrders, isLoading: ordersLoading } = useGetRecentOrders({
    limit: 6,
    ...branchIdParam,
  });
  const { data: annualSalesReport, isLoading: annualRevenueLoading } = useGetSalesReport({
    year: revenueYear,
    ...branchIdParam,
  });
  const { data: analyticsOrdersData, isLoading: analyticsOrdersLoading } = useListOrders({
    page: 1,
    limit: 1000,
    ...branchIdParam,
  });
  const { data: orderStatus, isLoading: statusLoading } = useGetOrderStatusBreakdown(branchIdParam);
  const { data: usersData } = useListUsers({ isActive: true, limit: 6 });

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

  const orderAnalyticsData = useMemo(() => {
    const orders = analyticsOrdersData?.data ?? [];
    const now = new Date();

    if (analyticsRange === "week") {
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now);
        d.setDate(now.getDate() - (6 - i));
        d.setHours(0, 0, 0, 0);
        return d;
      });
      return days.map((day) => {
        const dayEnd = new Date(day);
        dayEnd.setDate(day.getDate() + 1);
        const bucket = orders.filter((o) => {
          const dt = new Date(o.createdAt);
          return dt >= day && dt < dayEnd;
        });
        return {
          label: day.toLocaleDateString(undefined, { weekday: "short" }),
          orderCount: bucket.length,
          pendingCount: bucket.filter((o) => String(o.status) === "order_received").length,
          revenue: bucket.reduce((sum, o) => sum + o.totalAmount, 0),
        };
      });
    }

    if (analyticsRange === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const monthOrders = orders.filter((o) => {
        const dt = new Date(o.createdAt);
        return dt >= start && dt < end;
      });
      const weeks = ["W1", "W2", "W3", "W4", "W5"];
      return weeks.map((w, i) => {
        const weekStartDay = i * 7 + 1;
        const weekEndDay = Math.min((i + 1) * 7, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
        const bucket = monthOrders.filter((o) => {
          const d = new Date(o.createdAt).getDate();
          return d >= weekStartDay && d <= weekEndDay;
        });
        return {
          label: w,
          orderCount: bucket.length,
          pendingCount: bucket.filter((o) => String(o.status) === "order_received").length,
          revenue: bucket.reduce((sum, o) => sum + o.totalAmount, 0),
        };
      });
    }

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const yearOrders = orders.filter((o) => new Date(o.createdAt).getFullYear() === revenueYear);
    return months.map((m, i) => {
      const bucket = yearOrders.filter((o) => new Date(o.createdAt).getMonth() === i);
      return {
        label: m,
        orderCount: bucket.length,
        pendingCount: bucket.filter((o) => String(o.status) === "order_received").length,
        revenue: bucket.reduce((sum, o) => sum + o.totalAmount, 0),
      };
    });
  }, [analyticsOrdersData?.data, analyticsRange, revenueYear]);

  const pendingTotal = orderReceived + cancelled;
  const donutData = [
    { name: "Delivered", value: completedMain, fill: chartOrders },
    { name: "In progress", value: inProgress, fill: "hsl(var(--chart-2))" },
    { name: "Open", value: pendingTotal, fill: chartPending },
  ];
  const donutTotal = Math.max(completedMain + inProgress + pendingTotal, 1);
  const completedPct = Math.round((completedMain / donutTotal) * 100);

  const reminder = useMemo(() => {
    if (summary && summary.pendingPayments > 0) {
      return {
        title: "Pending payments",
        meta: `${summary.pendingPayments.toFixed(2)} invoice(s) need attention`,
      };
    }
    if (summary && summary.lowStockCount > 0) {
      return {
        title: "Low stock alert",
        meta: `${summary.lowStockCount} product(s) below threshold`,
      };
    }
    const urgent = recentOrders?.find(
      (o) =>
        (o.status as string) !== "complete" &&
        (o.status as string) !== "delivered" &&
        (o.status as string) !== "cancelled",
    );
    const first = urgent ?? recentOrders?.[0];
    if (!first)
      return { title: "No upcoming actions", meta: "You are all caught up" };
    return {
      title: `Follow up · ${first.orderNumber}`,
      meta: `${first.customerName} · ${first.status}`,
    };
  }, [summary, recentOrders]);

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
  const annualRevenue = annualSalesReport?.reduce((sum, item) => sum + item.revenue, 0) ?? 0;
  const yearOptions = useMemo(
    () => Array.from({ length: 6 }, (_, idx) => currentYear - idx),
    [currentYear],
  );
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

  const badgeForTeam = (u: User) =>
    !u.isActive ? (
      <Badge variant="outline" className="rounded-full border-rose-200 bg-rose-50 text-rose-700 capitalize">
        Inactive
      </Badge>
    ) : (
      <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/5 text-primary capitalize">
        Active
      </Badge>
    );

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1600px]">
      {/* Title row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-1 text-muted-foreground max-w-xl">
            Plan, prioritize, and run your showroom and orders — with live inventory and fulfilment insights.
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

      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loadingBlock ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[132px] rounded-3xl" />)
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
              <p className="mt-2 text-4xl font-bold tabular-nums">{totalOrders}</p>
              <p className="mt-3 text-xs text-primary-foreground/75">
                {summary?.completedOrdersToday ?? 0} completed today
              </p>
            </div>
            <MetricCardPlain
              title="Delivered"
              value={completedMain}
              hint={`${completedPct}% of pipeline`}
            />
            <MetricCardPlain title="In progress" value={inProgress} hint={`Manufacturing + ready to ship`} />
            <MetricCardPlain
              title="Order received"
              value={orderReceived}
              hint={cancelled > 0 ? `${cancelled} cancelled in mix` : "Needs action"}
            />
          </>
        )}
      </div>

      {/* Middle grid */}
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-5 xl:col-span-5 rounded-3xl border border-border bg-card p-5 md:p-6 shadow-sm">
          <div className="flex items-start justify-between gap-2 mb-6">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Order analytics</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Orders, order-received, and revenue from DB</p>
            </div>
            <div className="relative">
              <select
                value={analyticsRange}
                onChange={(e) => setAnalyticsRange(e.target.value as "week" | "month" | "year")}
                className="appearance-none rounded-xl border border-border bg-background pl-3 pr-8 py-1 text-xs text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                aria-label="Order analytics range"
              >
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
          <div className="md:h-[400px] h-[260px] w-full">
            {analyticsOrdersLoading ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Loading chart…</div>
            ) : !orderAnalyticsData.length ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm border border-dashed rounded-xl">
                No sales analytics data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orderAnalyticsData} barCategoryGap="22%" margin={{ top: 16, bottom: 0, left: 0, right: 0 }}>
                  <defs>
                    <pattern id="pending-orders-pattern" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <rect width="8" height="8" fill="hsl(var(--chart-pattern-bg))" />
                      <rect width="4" height="8" fill="hsl(var(--chart-pattern-stripe))" />
                    </pattern>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <YAxis
                    yAxisId="orders"
                    tickLine={false}
                    axisLine={false}
                    width={30}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <YAxis
                    yAxisId="revenue"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickFormatter={(v) => `₹${formatCompactCurrency(v)}`}
                  />
                  <RechartsTooltip
                    cursor={{ fill: "hsl(var(--accent))", radius: 12 }}
                    content={({ payload }: { payload?: Array<{ payload: { label: string; orderCount: number; pendingCount: number; revenue: number } }> }) =>
                      payload?.length ? (
                        <div className="rounded-2xl border bg-card px-3 py-2 text-sm shadow-md">
                          <p className="font-semibold">{payload[0]?.payload.label}</p>
                          <p className="text-muted-foreground mt-1">
                            Orders: <span className="font-medium text-foreground">{payload[0]?.payload.orderCount ?? 0}</span>
                          </p>
                          <p className="text-muted-foreground">
                            Order received: <span className="font-medium text-foreground">{payload[0]?.payload.pendingCount ?? 0}</span>
                          </p>
                          <p className="text-muted-foreground">
                            Revenue: <span className="font-medium text-foreground">{formatInr(payload[0]?.payload.revenue ?? 0)}</span>
                          </p>
                        </div>
                      ) : null
                    }
                  />
                  <Bar yAxisId="orders" dataKey="orderCount" name="Orders" fill={chartOrders} radius={[12, 12, 0, 0]} maxBarSize={26} />
                  <Bar yAxisId="orders" dataKey="pendingCount" name="Order received" fill="url(#pending-orders-pattern)" radius={[12, 12, 0, 0]} maxBarSize={26} />
                  <Bar yAxisId="revenue" dataKey="revenue" name="Revenue" fill={chartRevenue} radius={[12, 12, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="flex w-full justify-center flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
            <LegendDot color={chartOrders} label="Orders" />
            <LegendDot pattern label="Order received" />
            <LegendDot color={chartRevenue} label="Revenue" />
          </div>
        </div>

        <div className="lg:col-span-4 xl:col-span-4 flex flex-col gap-4">
          <div className="rounded-3xl border border-border bg-card p-5 md:p-6 shadow-sm flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Reminder</h2>
                <p className="text-muted-foreground text-sm mt-3 leading-snug">{reminder.title}</p>
              </div>
              <Badge variant="secondary" className="rounded-xl shrink-0 capitalize">
                <CalendarClock className="h-3.5 w-3.5 mr-1 opacity-70" aria-hidden />
                Today
              </Badge>
            </div>
            <p className="text-sm mt-4 text-muted-foreground">{reminder.meta}</p>
            <Button className="mt-6 w-full rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground" size="lg" asChild>
              <Link href="/orders">
                <Video className="h-4 w-4 mr-2" aria-hidden />
                Open orders
              </Link>
            </Button>
          </div>

          <div className="rounded-3xl border border-border bg-card p-5 md:p-6 shadow-sm min-h-[220px] relative">
            <h2 className="text-lg font-semibold tracking-tight mb-1">Fulfillment pulse</h2>
            <p className="text-sm text-muted-foreground mb-2">Orders by lifecycle stage</p>
            <div className="h-[220px] relative">
              {statusLoading ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
              ) : (
                <FulfillmentGauge completedPct={completedPct} segments={donutData} />
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-x-7 gap-y-2 mt-1 text-[11px] text-muted-foreground">
              <LegendDot color={chartOrders} label="Delivered" />
              <LegendDot color="hsl(var(--chart-2))" label="In progress" />
              <LegendDot pattern label="Open" />
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 xl:col-span-3 rounded-3xl border border-border bg-card p-5 md:p-6 shadow-sm flex flex-col min-h-[420px]">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Recent orders</h2>
            <Button variant="outline" size="sm" className="rounded-xl h-5 text-xs border-primary/20" asChild>
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
                        "flex  gap-3 rounded-2xl border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted/40",
                      )}
                    >
                      <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                        <Icon className="h-5 w-5 opacity-90" aria-hidden />
                      </div>
                      <div className="min-w-0 w-full flex justify-between gap-2 ">
                        <div className="grid">

                        <p className="text-sm font-medium truncate">{order.customerName}</p>
                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{order.orderNumber}</p>
                        </div>
                        <div className="mt-2">
                          {orderStatusChip(order.status)}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6 pb-4">
        <div className="lg:col-span-8 xl:col-span-8 rounded-3xl border border-border bg-card p-5 md:p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Team access</h2>
            <Button variant="outline" size="sm" className="rounded-xl h-9 text-xs border-primary/20" asChild>
              <Link href="/users">+ Add member</Link>
            </Button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border/80">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wider [&_th]:font-medium">
                  <th className="text-left py-3 pl-4 pr-2 rounded-tl-xl">Member</th>
                  <th className="text-left py-3 px-2 hidden sm:table-cell">Role</th>
                  <th className="text-right py-3 pr-4 rounded-tr-xl">Status</th>
                </tr>
              </thead>
              <tbody>
                {!usersData?.data?.length ? (
                  <tr>
                    <td colSpan={3} className="py-10 text-center text-muted-foreground">
                      No active users loaded
                    </td>
                  </tr>
                ) : (
                  usersData.data.slice(0, 3).map((u) => (
                    <tr key={u.id} className="border-t border-border/60 hover:bg-muted/20 transition-colors">
                      <td className="py-3 pl-4 pr-2">
                        <div className="flex items-center gap-3 min-w-[180px]">
                          <Avatar className="h-10 w-10 shrink-0 rounded-full border border-border/60">
                            <AvatarImage src={(u as any).avatarUrl || avatarUrlForName(u.name)} alt={u.name} />
                            <AvatarFallback className="text-xs bg-primary/12 text-primary font-bold">
                              {initials(u.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{u.name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{u.email ?? u.mobile}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-muted-foreground hidden sm:table-cell">
                        <span className="line-clamp-2 capitalize">{u.role?.name ?? "Staff"} · {u.branch?.name ?? "All branches"}</span>
                      </td>
                      <td className="py-3 pr-4 text-right">{badgeForTeam(u)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-4 xl:col-span-4">
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

      
    </div>
  );
}

function MetricCardPlain({
  title,
  value,
  hint,
}: {
  title: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card text-card-foreground p-6 shadow-sm relative overflow-hidden hover:shadow-md transition-shadow">
      <div className="absolute right-4 top-4 text-muted-foreground/40">
        <ArrowUpRight className="h-6 w-6" aria-hidden />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="mt-2 text-4xl font-bold tabular-nums">{value}</p>
      <p className="mt-3 text-xs text-muted-foreground leading-snug max-w-[200px]">{hint}</p>
    </div>
  );
}

function LegendDot({
  color,
  label,
  pattern,
}: {
  color?: string;
  label: string;
  pattern?: boolean;
}) {
  const patternStyle: React.CSSProperties = {
    backgroundColor: "hsl(var(--chart-pattern-bg))",
    backgroundImage:
      "repeating-linear-gradient(135deg, hsl(var(--chart-pattern-stripe)) 0 2px, transparent 2px 6px)",
    backgroundSize: "8px 8px",
  };

  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn("h-3 w-3 rounded-full shrink-0", pattern && "opacity-95")}
        style={pattern ? patternStyle : color ? { backgroundColor: color } : undefined}
      />
      {label}
    </span>
  );
} 

function FulfillmentGauge({
  completedPct,
  segments,
}: {
  completedPct: number;
  segments: { name: string; value: number; fill: string }[];
}) {
  const total = Math.max(segments.reduce((sum, seg) => sum + seg.value, 0), 1);
  const centerX = 210;
  const centerY = 206;
  const radius = 156;
  const strokeWidth = 60;
  const gapDeg = 4;
  // Keep this gauge as a strict half arc (180deg).
  const startDeg = 180;
  const endDeg = 0;
  const span = Math.max(startDeg - endDeg - gapDeg * (segments.length - 1), 0);

  const minSweep = 14;
  const baseAllocation = minSweep * segments.length;
  const distributable = Math.max(span - baseAllocation, 0);
  const weighted = segments.map((seg) => (seg.value / total) * distributable);

  let cursor = startDeg;
  const arcs = segments.map((seg, idx) => {
    const sweep = minSweep + weighted[idx];
    const segStart = cursor;
    const segEnd = Math.max(cursor - sweep, endDeg);
    cursor = segEnd - gapDeg;
    return { ...seg, start: segStart, end: segEnd };
  });

  // SVG paints in document order — draw Delivered last so it sits on top at overlaps.
  const arcRenderOrder = [...arcs].sort((a, b) => {
    const zIndex: Record<string, number> = {
      Open: 0,
      "In progress": 1,
      Delivered: 2,
      Complete: 2,
    };
    return (zIndex[a.name] ?? 0) - (zIndex[b.name] ?? 0);
  });

  return (
    <div className="relative h-full w-full">
      <svg viewBox="0 0 420 320" className="h-full w-full" aria-label="Project progress gauge">
        <defs>
          <pattern id="pending-stripes" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="9" height="8" fill="hsl(var(--chart-pattern-bg))" />
            <rect width="4" height="8" fill="hsl(var(--chart-pattern-stripe))" />
          </pattern>
        </defs>
        {arcRenderOrder.map((arc, idx) => (
          <path
            key={`${arc.name}-${idx}`}
            d={describeSegment(centerX, centerY, radius, arc.start, arc.end)}
            fill="none"
            stroke={arc.name === "Open" ? "url(#pending-stripes)" : arc.fill}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-14">
        <p className="text-[3rem] font-semibold leading-[0.92] tracking-tight text-black tabular-nums">{completedPct}%</p>
        <p className="text-[1.05rem] leading-none text-primary mt-1">Order Delivered</p>
      </div>
    </div>
  );
}

function describeSegment(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const step = 2;
  const points: { x: number; y: number }[] = [];
  for (let deg = startDeg; deg >= endDeg; deg -= step) {
    points.push(polarToCartesian(cx, cy, r, deg));
  }
  const last = polarToCartesian(cx, cy, r, endDeg);
  if (!points.length || points[points.length - 1].x !== last.x || points[points.length - 1].y !== last.y) {
    points.push(last);
  }
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy - r * Math.sin(rad),
  };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDue(createdAt: string) {
  const d = new Date(createdAt);
  d.setDate(d.getDate() + 7);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatCompactCurrency(value: number) {
  if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return `${Math.round(value)}`;
}

function avatarUrlForName(name: string) {
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(name || "user")}&radius=50&backgroundColor=f8d1d1,cfe7b2,c8ccff,f5dfbf,bfe3ff,d9c6ff`;
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
