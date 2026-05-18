import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, ChevronRight, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  addDaysYmd,
  buildDateSlotSchedule,
  formatYmdLabel,
  localTodayYmd,
  normalizeDeliveryStatus,
  type DeliveryOrderRow,
} from "@/lib/delivery-stats";
import {
  DELIVERY_STATUS_LABEL,
  deliveriesPageHref,
  deliveryStatusBadgeClass,
} from "@/lib/delivery-status-ui";

type RangeKey = "today" | "tomorrow" | "upcoming";

const UPCOMING_DAYS = 14;
const LIST_LIMIT = 10;

type FlatDelivery = {
  dateYmd: string;
  order: DeliveryOrderRow;
  slotLabel: string;
  timeRange: string;
};

function flattenSchedule(
  orders: DeliveryOrderRow[],
  fromYmd: string,
  toYmd: string,
): FlatDelivery[] {
  const schedule = buildDateSlotSchedule(orders, { fromYmd, toYmd });
  const items: FlatDelivery[] = [];
  for (const day of schedule) {
    for (const slot of day.slots) {
      for (const order of slot.orders) {
        items.push({
          dateYmd: day.dateYmd,
          order,
          slotLabel: slot.label,
          timeRange: slot.timeRange,
        });
      }
    }
  }
  return items;
}

export function DashboardUpcomingDeliveries({
  orders,
  loading,
}: {
  orders: DeliveryOrderRow[];
  loading?: boolean;
}) {
  const todayYmd = localTodayYmd();
  const tomorrowYmd = addDaysYmd(todayYmd, 1);
  const upcomingToYmd = addDaysYmd(todayYmd, UPCOMING_DAYS);

  const [range, setRange] = useState<RangeKey>("today");

  const counts = useMemo(
    () => ({
      today: flattenSchedule(orders, todayYmd, todayYmd).length,
      tomorrow: flattenSchedule(orders, tomorrowYmd, tomorrowYmd).length,
      upcoming: flattenSchedule(orders, todayYmd, upcomingToYmd).length,
    }),
    [orders, todayYmd, tomorrowYmd, upcomingToYmd],
  );

  const { fromYmd, toYmd, items } = useMemo(() => {
    if (range === "today") {
      return {
        fromYmd: todayYmd,
        toYmd: todayYmd,
        items: flattenSchedule(orders, todayYmd, todayYmd),
      };
    }
    if (range === "tomorrow") {
      return {
        fromYmd: tomorrowYmd,
        toYmd: tomorrowYmd,
        items: flattenSchedule(orders, tomorrowYmd, tomorrowYmd),
      };
    }
    return {
      fromYmd: todayYmd,
      toYmd: upcomingToYmd,
      items: flattenSchedule(orders, todayYmd, upcomingToYmd),
    };
  }, [range, orders, todayYmd, tomorrowYmd, upcomingToYmd]);

  const visible = items.slice(0, LIST_LIMIT);
  const deliveriesHref = deliveriesPageHref(fromYmd, toYmd);

  const rangeLabels: { key: RangeKey; label: string; count: number }[] = [
    { key: "today", label: "Today", count: counts.today },
    { key: "tomorrow", label: "Tomorrow", count: counts.tomorrow },
    { key: "upcoming", label: "Upcoming", count: counts.upcoming },
  ];

  return (
    <div className="flex flex-col min-h-[280px]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Today&apos;s actions</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Deliveries scheduled for today, tomorrow, and the next two weeks.
          </p>
        </div>
        <Link
          href={deliveriesPageHref(todayYmd, upcomingToYmd)}
          className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          aria-label="Open deliveries"
        >
          <ArrowUpRight className="h-5 w-5" />
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {rangeLabels.map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setRange(key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors tabular-nums",
              range === key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60",
            )}
          >
            {label}
            <span className="ml-1.5 opacity-80">({count})</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex-1 min-h-0">
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading deliveries…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center rounded-xl border border-dashed">
            {range === "today"
              ? "No deliveries scheduled for today."
              : range === "tomorrow"
                ? "No deliveries scheduled for tomorrow."
                : "No upcoming deliveries in the next two weeks."}
          </p>
        ) : (
          <ul className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
            {visible.map(({ dateYmd, order, slotLabel, timeRange }) => {
              const del = normalizeDeliveryStatus(order.deliveryStatus);
              const showDate = range === "upcoming";
              return (
                <li key={`${order.id}-${dateYmd}`}>
                  <Link
                    href={deliveriesPageHref(dateYmd, dateYmd)}
                    className="flex items-center gap-3 rounded-xl border border-border/80 bg-muted/15 px-3 py-2.5 hover:bg-muted/40 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-mono text-sm font-medium">{order.orderNumber}</span>
                        <span className="text-sm truncate">{order.customerName}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {showDate ? (
                          <>
                            <span className="font-medium text-foreground/80">
                              {formatYmdLabel(dateYmd).split(",")[0]}
                            </span>
                            {" · "}
                          </>
                        ) : null}
                        {slotLabel} · {timeRange}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium",
                        deliveryStatusBadgeClass(del),
                      )}
                    >
                      {DELIVERY_STATUS_LABEL[del]}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {!loading && items.length > LIST_LIMIT ? (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            +{items.length - LIST_LIMIT} more in this range
          </p>
        ) : null}
      </div>

      <Button className="rounded-full mt-5 w-full" size="lg" asChild>
        <Link href={deliveriesHref}>
          <Truck className="h-4 w-4 mr-2" aria-hidden />
          View on deliveries
        </Link>
      </Button>
    </div>
  );
}
