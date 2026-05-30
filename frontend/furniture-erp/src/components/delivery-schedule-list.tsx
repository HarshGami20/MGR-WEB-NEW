import { useMemo } from "react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getListOrdersQueryKey } from "@/api-client";
import { patchOrderDelivery } from "@/lib/delivery-api";
import {
  buildDateSlotSchedule,
  formatYmdLabel,
  normalizeDeliveryStatus,
  type DeliveryOrderRow,
  type DeliveryStatusValue,
  type SlotGroup,
} from "@/lib/delivery-stats";
import type { DeliverySlotRow } from "@/lib/delivery-api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Eye } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatInr } from "@/lib/format-currency";
import { DELIVERY_STATUS_LABEL } from "@/lib/delivery-status-ui";
import { DELIVERY_SLOTS_ENABLED } from "@/lib/delivery-feature";

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
  drivers = [],
  canAssignDriver = true,
}: {
  orders: DeliveryOrderRow[];
  slots?: DeliverySlotRow[];
  branchId: number;
  /** Omit both bounds to show every order that has a delivery date. */
  fromYmd?: string;
  toYmd?: string;
  loading?: boolean;
  /** When false or a function returns false, delivery status is read-only for that row. */
  canUpdateStatus?: boolean | ((order: DeliveryOrderRow) => boolean);
  drivers?: Array<{ id: number; name: string }>;
  canAssignDriver?: boolean;
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

  const enrichSlots = useMemo(
    () => (daySlots: SlotGroup[]) =>
      daySlots.map((slot) => {
        const cap = slot.slotId != null ? slotCapacity.get(slot.slotId) : null;
        return {
          ...slot,
          maxOrders: cap?.maxOrders ?? slot.maxOrders,
          booked: cap?.bookedCount ?? slot.booked,
        };
      }),
    [slotCapacity],
  );

  const schedule = useMemo(
    () =>
      buildDateSlotSchedule(orders, { fromYmd, toYmd }).map((day) => ({
        dateYmd: day.dateYmd,
        slots: enrichSlots(day.slots),
      })),
    [orders, fromYmd, toYmd, enrichSlots],
  );

  const patchDelivery = useMutation({
    mutationFn: (vars: {
      orderId: number;
      deliveryStatus?: DeliveryStatusValue;
      driverId?: number | null;
    }) =>
      patchOrderDelivery(vars.orderId, branchId, {
        ...(vars.deliveryStatus !== undefined ? { deliveryStatus: vars.deliveryStatus } : {}),
        ...(vars.driverId !== undefined ? { driverId: vars.driverId } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["deliverySlots"] });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      toast({ title: "Delivery updated" });
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
        {fromYmd || toYmd
          ? "No booked deliveries in this date range."
          : "No orders with a delivery date yet."}
      </p>
    );
  }

  const dateOnlyLayout = !DELIVERY_SLOTS_ENABLED;

  const renderSlotBlock = (dayYmd: string, slot: SlotGroup) => (
    <div
      key={`${dayYmd}-${slot.slotId ?? "none"}`}
      className="rounded-2xl border border-border/80 bg-muted/15 overflow-hidden"
    >
      {!dateOnlyLayout ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-muted/30 border-b border-border/60">
          <div>
            <p className="font-medium text-sm">{slot.label}</p>
            {slot.timeRange ? <p className="text-xs text-muted-foreground">{slot.timeRange}</p> : null}
          </div>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {slot.booked}
            {slot.maxOrders != null ? ` / ${slot.maxOrders}` : ""} booked
          </span>
        </div>
      ) : null}
      <ul className="divide-y divide-border/60">{slot.orders.map(renderOrderRow)}</ul>
    </div>
  );

  const renderSlots = (dayYmd: string, daySlots: SlotGroup[]) => {
    if (dateOnlyLayout) {
      const dayOrders = daySlots.flatMap((slot) => slot.orders);
      return (
        <div className="rounded-2xl border border-border/80 bg-muted/15 overflow-hidden">
          <ul className="divide-y divide-border/60">{dayOrders.map(renderOrderRow)}</ul>
        </div>
      );
    }
    return daySlots.map((slot) => renderSlotBlock(dayYmd, slot));
  };

  const renderOrderRow = (order: DeliveryOrderRow) => {
    const del = normalizeDeliveryStatus(order.deliveryStatus);
    const rowPending = patchDelivery.isPending && patchDelivery.variables?.orderId === order.id;
    const canUpdate =
      typeof canUpdateStatus === "function" ? canUpdateStatus(order) : canUpdateStatus;
    const driverId = order.driver?.id ?? order.driverId ?? null;

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
          {(order.deliveryCharge ?? 0) > 0 ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              Delivery charge: {formatInr(Number(order.deliveryCharge))}
            </p>
          ) : null}
        </div>

        <div className="flex  items-center gap-2 shrink-0">
          {canAssignDriver && drivers.length > 0 ? (
            <Select
              value={driverId != null ? String(driverId) : "none"}
              disabled={rowPending}
              onValueChange={(val) =>
                patchDelivery.mutate({
                  orderId: order.id,
                  driverId: val === "none" ? null : parseInt(val, 10),
                })
              }
            >
              <SelectTrigger className="h-8 min-w-[130px] text-xs">
                <SelectValue placeholder="Assign driver" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No driver</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : order.driver?.name ? (
            <span className="text-xs text-muted-foreground px-2">{order.driver.name}</span>
          ) : null}
          {canUpdate ? (
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
                <SelectItem value="out_for_delivery">Out for delivery</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
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
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-8 aspect-square w-8")}
          >
            <Eye className="h-4 w-4" />
          </Link>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      {schedule.map((day) => {
        const dayOrderCount = day.slots.reduce((n, slot) => n + slot.orders.length, 0);

        return (
          <section key={day.dateYmd} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/80 pb-2">
              <h3 className="text-base font-semibold text-foreground">{formatYmdLabel(day.dateYmd)}</h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {dayOrderCount} order{dayOrderCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="space-y-3">{renderSlots(day.dateYmd, day.slots)}</div>
          </section>
        );
      })}
    </div>
  );
}
