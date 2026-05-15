import { useMemo } from "react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getListOrdersQueryKey } from "@/api-client";
import { patchOrderDelivery } from "@/lib/delivery-api";
import {
  buildDateSlotSchedule,
  formatYmdLabel,
  normalizeDeliveryStatus,
  normalizeMainStatus,
  type DeliveryOrderRow,
  type DeliveryStatusValue,
} from "@/lib/delivery-stats";
import type { DeliverySlotRow } from "@/lib/delivery-api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Eye } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DELIVERY_STATUS_LABEL: Record<DeliveryStatusValue, string> = {
  pending: "Pending",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};

function deliveryStatusTriggerClass(s: DeliveryStatusValue) {
  switch (s) {
    case "pending":
      return "text-amber-800";
    case "out_for_delivery":
      return "text-sky-800";
    case "delivered":
      return "text-emerald-800";
  }
}

export function DeliveryScheduleList({
  orders,
  slots,
  branchId,
  fromYmd,
  toYmd,
  loading,
  canUpdateStatus = true,
}: {
  orders: DeliveryOrderRow[];
  slots?: DeliverySlotRow[];
  branchId: number;
  fromYmd: string;
  toYmd: string;
  loading?: boolean;
  canUpdateStatus?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const slotCapacity = useMemo(() => {
    const map = new Map<number, { maxOrders: number; bookedCount: number }>();
    for (const s of slots ?? []) {
      map.set(s.id, { maxOrders: s.maxOrders, bookedCount: s.bookedCount });
    }
    return map;
  }, [slots]);

  const schedule = useMemo(
    () =>
      buildDateSlotSchedule(orders, { fromYmd, toYmd }).map((day) => ({
        ...day,
        slots: day.slots.map((slot) => {
          const cap = slot.slotId != null ? slotCapacity.get(slot.slotId) : null;
          return {
            ...slot,
            maxOrders: cap?.maxOrders ?? slot.maxOrders,
            booked: cap?.bookedCount ?? slot.booked,
          };
        }),
      })),
    [orders, fromYmd, toYmd, slotCapacity],
  );

  const patchDelivery = useMutation({
    mutationFn: (vars: { orderId: number; deliveryStatus: DeliveryStatusValue }) =>
      patchOrderDelivery(vars.orderId, branchId, { deliveryStatus: vars.deliveryStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["deliverySlots"] });
      toast({ title: "Delivery status updated" });
    },
    onError: (e: Error) =>
      toast({ title: "Delivery update failed", description: e.message, variant: "destructive" }),
  });

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading delivery schedule…</p>;
  }

  if (schedule.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center rounded-xl border border-dashed">
        No booked deliveries in this date range.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {schedule.map((day) => (
        <section key={day.dateYmd} className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/80 pb-2">
            <h3 className="text-base font-semibold text-foreground">{formatYmdLabel(day.dateYmd)}</h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {day.slots.reduce((n, s) => n + s.orders.length, 0)} order
              {day.slots.reduce((n, s) => n + s.orders.length, 0) === 1 ? "" : "s"}
            </span>
          </div>

          {day.slots.map((slot) => (
            <div
              key={`${day.dateYmd}-${slot.slotId ?? "none"}`}
              className="rounded-2xl border border-border/80 bg-muted/15 overflow-hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-muted/30 border-b border-border/60">
                <div>
                  <p className="font-medium text-sm">{slot.label}</p>
                  <p className="text-xs text-muted-foreground">{slot.timeRange}</p>
                </div>
                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                  {slot.booked}
                  {slot.maxOrders != null ? ` / ${slot.maxOrders}` : ""} booked
                </span>
              </div>

              <ul className="divide-y divide-border/60">
                {slot.orders.map((order) => {
                  const del = normalizeDeliveryStatus(order.deliveryStatus);
                  const main = normalizeMainStatus(order.status);
                  const rowPending =
                    patchDelivery.isPending && patchDelivery.variables?.orderId === order.id;

                  return (
                    <li
                      key={order.id}
                      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-medium">{order.orderNumber}</span>
                          <span className="text-sm text-foreground truncate">{order.customerName}</span>
                        </div>
                        {order.customerMobile ? (
                          <p className="text-xs text-muted-foreground mt-0.5">{order.customerMobile}</p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {canUpdateStatus ? (
                          <Select
                            value={del}
                            disabled={rowPending}
                            onValueChange={(val) =>
                              patchDelivery.mutate({
                                orderId: order.id,
                                deliveryStatus: val as DeliveryStatusValue,
                              })
                            }
                          >
                            <SelectTrigger
                              className={cn(
                                "h-8 min-w-[148px] border-border text-xs font-medium",
                                deliveryStatusTriggerClass(del),
                              )}
                            >
                              <SelectValue>{DELIVERY_STATUS_LABEL[del]}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem
                                value="out_for_delivery"
                                disabled={main !== "ready_to_ship"}
                              >
                                Out for delivery
                              </SelectItem>
                              <SelectItem
                                value="delivered"
                                disabled={del !== "out_for_delivery"}
                              >
                                Delivered
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span
                            className={cn(
                              "inline-flex h-8 min-w-[148px] items-center rounded-md border border-border px-3 text-xs font-medium",
                              deliveryStatusTriggerClass(del),
                            )}
                          >
                            {DELIVERY_STATUS_LABEL[del]}
                          </span>
                        )}
                        <Link
                          href={`/orders/${order.id}`}
                          aria-label={`View order ${order.orderNumber}`}
                          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-8 w-8")}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
