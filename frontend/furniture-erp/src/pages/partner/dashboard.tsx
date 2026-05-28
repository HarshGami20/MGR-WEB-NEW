import { useMemo } from "react";
import { Link } from "wouter";
import { useListPurchaseOrders } from "@/api-client";
import { useAuth } from "@/lib/auth";
import { isPartnerPortalUser, partnerPortalLabel } from "@/lib/partner";
import { isOpenPurchaseOrderStatus } from "@/lib/partner-po-attributes";
import { poStatusChip } from "@/lib/partner-po-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Factory,
  Package,
  Truck,
  ArrowRight,
  ClipboardList,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Headphones,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInr } from "@/lib/format-currency";

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

const PIPELINE_STATUSES = [
  { key: "pending", label: "Pending", color: "bg-yellow-500" },
  { key: "confirmed", label: "Confirmed", color: "bg-blue-500" },
  { key: "in_production", label: "In production", color: "bg-purple-500" },
  { key: "shipped", label: "Shipped", color: "bg-indigo-500" },
  { key: "delivered", label: "Delivered", color: "bg-primary" },
] as const;

export default function PartnerDashboardPage() {
  const { user } = useAuth();

  const { data: openData, isLoading: openLoading } = useListPurchaseOrders({
    openOnly: "true",
    page: 1,
    limit: 1,
  } as Parameters<typeof useListPurchaseOrders>[0]);

  const { data: statsData, isLoading: statsLoading } = useListPurchaseOrders({
    page: 1,
    limit: 200,
  });

  const { data: recentData, isLoading: recentLoading } = useListPurchaseOrders({
    page: 1,
    limit: 8,
  });

  const allForStats = statsData?.data ?? [];
  const recent = recentData?.data ?? [];
  const openTotal = openData?.total ?? 0;
  const loadingKpis = openLoading || statsLoading;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const po of allForStats) {
      const s = String(po.status ?? "pending");
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [allForStats]);

  const pipelineTotal = useMemo(
    () => PIPELINE_STATUSES.reduce((sum, s) => sum + (statusCounts[s.key] ?? 0), 0),
    [statusCounts],
  );

  const inProgressCount = useMemo(
    () =>
      (statusCounts.confirmed ?? 0) +
      (statusCounts.in_production ?? 0) +
      (statusCounts.shipped ?? 0),
    [statusCounts],
  );

  const openValue = useMemo(
    () =>
      allForStats
        .filter((po) => isOpenPurchaseOrderStatus(String(po.status)))
        .reduce((sum, po) => sum + Number(po.totalAmount ?? 0), 0),
    [allForStats],
  );

  if (!user || !isPartnerPortalUser(user)) return null;

  const isSupplier = !!user.supplierId;
  const PanelIcon = isSupplier ? Truck : Factory;
  const panelTitle = isSupplier ? "Supplier portal" : "Manufacturer portal";
  const orgLabel = partnerPortalLabel(user);

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1600px]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{panelTitle}</h1>
          <p className="mt-1 text-muted-foreground flex flex-wrap items-center gap-2">
            <PanelIcon className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              Welcome, <span className="font-medium text-foreground">{orgLabel}</span>
            </span>
          </p>
          
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <Button
            asChild
            size="lg"
            className="rounded-xl px-5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
          >
            <Link href="/purchase-orders">
              <ClipboardList className="h-4 w-4 mr-1" aria-hidden />
              All orders
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-xl px-5 border-primary/25 bg-background">
            <Link href="/complaints">
              <Headphones className="h-4 w-4 mr-1" aria-hidden />
              Complaints
            </Link>
          </Button>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Purchase orders</h2>
            <span className="text-xs text-muted-foreground">Overview</span>
          </div>
          {!loadingKpis && openValue > 0 ? (
            <Badge variant="outline" className="rounded-xl text-xs">
              Open value ₹{formatCompactCurrency(openValue)}
            </Badge>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loadingKpis ? (
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
                <p className="text-sm font-medium text-primary-foreground/85">Open orders</p>
                <p className="mt-2 text-4xl font-bold tabular-nums">{openTotal}</p>
                <p className="mt-3 text-xs text-primary-foreground/75">
                  Pending confirmation, production, or shipment
                </p>
              </div>
              <MetricCardPlain
                title="Pending"
                value={statusCounts.pending ?? 0}
                hint="Awaiting your confirmation"
              />
              <MetricCardPlain
                title="In progress"
                value={inProgressCount}
                hint="Confirmed, production, or shipped"
              />
              <MetricCardPlain
                title="Delivered"
                value={statusCounts.delivered ?? 0}
                hint={
                  (statusCounts.cancelled ?? 0) > 0
                    ? `${statusCounts.cancelled} cancelled in records`
                    : "Completed fulfilment"
                }
              />
            </>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-7 rounded-3xl border border-border bg-card p-5 md:p-6 shadow-sm">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" aria-hidden />
                Order status mix
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Distribution across your recent purchase orders
              </p>
            </div>
            <Badge variant="outline" className="rounded-xl text-xs">
              {pipelineTotal} tracked
            </Badge>
          </div>
          {statsLoading ? (
            <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">
              Loading status breakdown…
            </div>
          ) : pipelineTotal === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm border border-dashed rounded-xl">
              No purchase orders yet — new orders from MGR CASA will appear here.
            </div>
          ) : (
            <ul className="space-y-3">
              {PIPELINE_STATUSES.map((row) => {
                const count = statusCounts[row.key] ?? 0;
                const pct = pipelineTotal > 0 ? (count / pipelineTotal) * 100 : 0;
                return (
                  <li key={row.key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{row.label}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {count}{" "}
                        <span className="text-xs opacity-70">({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", row.color)}
                        style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }}
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
              <Clock className="h-4 w-4 text-primary" aria-hidden />
              Quick actions
            </h2>
          </div>
          <ul className="space-y-2 flex-1">
            <li>
              <Link
                href="/purchase-orders"
                className="flex items-center gap-3 rounded-2xl border border-border/80 bg-muted/20 px-4 py-3.5 transition-colors hover:border-primary/25 hover:bg-primary/5"
              >
                <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                  <ClipboardList className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">All purchase orders</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Filter, update status, and open line details
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            </li>
            <li>
              <Link
                href="/purchase-orders?status=open"
                className="flex items-center gap-3 rounded-2xl border border-border/80 bg-muted/20 px-4 py-3.5 transition-colors hover:border-primary/25 hover:bg-primary/5"
              >
                <div className="h-11 w-11 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 text-amber-700">
                  <Package className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Open orders</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {openLoading ? "Loading…" : `${openTotal} order(s) need attention`}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            </li>
            <li>
              <Link
                href="/complaints"
                className="flex items-center gap-3 rounded-2xl border border-border/80 bg-muted/20 px-4 py-3.5 transition-colors hover:border-primary/25 hover:bg-primary/5"
              >
                <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                  <Headphones className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Complaints</p>
                  <p className="text-xs text-muted-foreground mt-0.5">View issues on your purchase orders</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            </li>
          </ul>
          <div className="mt-4 rounded-2xl border border-dashed border-border/80 bg-muted/30 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Portal role</p>
            <p className="mt-1 text-sm font-semibold flex items-center gap-2">
              {isSupplier ? (
                <>
                  <Truck className="h-4 w-4 text-primary" />
                  Supplier fulfilment
                </>
              ) : (
                <>
                  <Factory className="h-4 w-4 text-primary" />
                  Manufacturer fulfilment
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 md:p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" aria-hidden />
              Recent purchase orders
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">Latest activity — open any order for line items</p>
          </div>
          <Button variant="outline" size="sm" className="rounded-xl h-8 text-xs border-primary/20" asChild>
            <Link href="/purchase-orders">
              View all
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>

        <ul className="space-y-2">
          {recentLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex gap-3 rounded-2xl px-2 py-2">
                <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </li>
            ))
          ) : recent.length === 0 ? (
            <li className="text-muted-foreground text-sm py-12 text-center border border-dashed rounded-xl">
              No purchase orders yet.
            </li>
          ) : (
            recent.map((po) => {
              const open = isOpenPurchaseOrderStatus(String(po.status));
              const delivery = po.expectedDelivery
                ? new Date(po.expectedDelivery).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : null;
              return (
                <li key={po.id}>
                  <Link
                    href={`/purchase-orders/${po.id}`}
                    className={cn(
                      "flex flex-wrap items-center gap-3 rounded-2xl border border-transparent px-2 py-2.5 transition-colors sm:flex-nowrap",
                      "hover:border-border hover:bg-muted/40",
                    )}
                  >
                    <div
                      className={cn(
                        "h-11 w-11 rounded-xl flex items-center justify-center shrink-0",
                        open ? "bg-amber-500/10 text-amber-700" : "bg-primary/10 text-primary",
                      )}
                    >
                      {open ? (
                        <Clock className="h-5 w-5 opacity-90" aria-hidden />
                      ) : (
                        <CheckCircle2 className="h-5 w-5 opacity-90" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 grid sm:grid-cols-[1fr_auto] gap-x-4 gap-y-1 items-center">
                      <div className="min-w-0">
                        <p className="text-sm font-medium font-mono text-foreground">{po.poNumber}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {(po as { branch?: { name?: string } }).branch?.name ?? "—"}
                          {delivery ? ` · Expected ${delivery}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {poStatusChip(String(po.status))}
                        <span className="text-sm font-semibold tabular-nums shrink-0">
                          {formatInr(Number(po.totalAmount ?? 0))}
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
                  </Link>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
