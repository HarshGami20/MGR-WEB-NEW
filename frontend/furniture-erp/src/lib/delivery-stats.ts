export type DeliveryOrderRow = {
  id: number;
  orderNumber: string;
  customerName: string;
  customerMobile?: string | null;
  status: string;
  deliveryStatus?: string | null;
  deliveryDate?: string | null;
  deliveryCharge?: number;
  categoryId?: number | null;
  category?: { id: number; name: string } | null;
  driver?: { id: number; name: string; mobile?: string | null } | null;
  driverId?: number | null;
  deliveryAssignees?: Array<{ id: number; name?: string; mobile?: string }>;
  deliverySlotId?: number | null;
  deliverySlot?: {
    id: number;
    label: string;
    startTime: string;
    endTime: string;
    slotDate?: string;
  } | null;
};

export type DeliveryStatusValue = "pending" | "out_for_delivery" | "delivered";

export function ymdFromIso(value: string | null | undefined): string | null {
  if (value == null || String(value).trim() === "") return null;
  return String(value).trim().slice(0, 10);
}

export function orderDeliveryYmd(order: DeliveryOrderRow): string | null {
  return ymdFromIso(order.deliveryDate ?? order.deliverySlot?.slotDate ?? null);
}

export function localTodayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatYmdLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function normalizeMainStatus(status: string): string {
  return status === "delivered" ? "complete" : status;
}

export function normalizeDeliveryStatus(status: string | null | undefined): DeliveryStatusValue {
  if (status === "out_for_delivery" || status === "delivered") return status;
  return "pending";
}

export type DeliveryDayStats = {
  scheduled: number;
  pending: number;
  outForDelivery: number;
  delivered: number;
  dailyGoal: number;
  progressPct: number;
};

export function computeDeliveryDayStats(
  orders: DeliveryOrderRow[],
  dayYmd: string,
  dailyGoal: number,
): DeliveryDayStats {
  const dayOrders = orders.filter((o) => {
    if (normalizeMainStatus(o.status) === "cancelled") return false;
    return orderDeliveryYmd(o) === dayYmd;
  });

  let pending = 0;
  let outForDelivery = 0;
  let delivered = 0;
  for (const o of dayOrders) {
    const del = normalizeDeliveryStatus(o.deliveryStatus);
    if (del === "delivered") delivered += 1;
    else if (del === "out_for_delivery") outForDelivery += 1;
    else pending += 1;
  }

  const scheduled = dayOrders.length;
  const goal = Math.max(dailyGoal, scheduled, 1);
  const progressPct = Math.min(100, Math.round((delivered / goal) * 100));

  return {
    scheduled,
    pending,
    outForDelivery,
    delivered,
    dailyGoal: goal,
    progressPct,
  };
}

export type SlotGroup = {
  slotId: number | null;
  label: string;
  timeRange: string;
  booked: number;
  maxOrders: number | null;
  orders: DeliveryOrderRow[];
};

export type DateScheduleGroup = {
  dateYmd: string;
  slots: SlotGroup[];
};

export type CategoryScheduleGroup = {
  categoryId: number | null;
  categoryName: string;
  orderCount: number;
  slots: SlotGroup[];
};

export function orderCategoryLabel(order: DeliveryOrderRow): string {
  return order.category?.name?.trim() || "Uncategorized";
}

export function groupOrdersByCategory(orders: DeliveryOrderRow[]): CategoryScheduleGroup[] {
  const map = new Map<string, { categoryId: number | null; categoryName: string; orders: DeliveryOrderRow[] }>();
  for (const order of orders) {
    const categoryId = order.categoryId ?? order.category?.id ?? null;
    const key = categoryId != null ? String(categoryId) : "uncategorized";
    const existing = map.get(key);
    if (existing) {
      existing.orders.push(order);
    } else {
      map.set(key, {
        categoryId,
        categoryName: orderCategoryLabel(order),
        orders: [order],
      });
    }
  }

  return Array.from(map.values())
    .map((group) => ({
      categoryId: group.categoryId,
      categoryName: group.categoryName,
      orderCount: group.orders.length,
      slots: buildSlotGroups(group.orders),
    }))
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
}

export function buildSlotGroups(orders: DeliveryOrderRow[]): SlotGroup[] {
  const slotMap = new Map<string, SlotGroup>();

  for (const o of orders) {
    const slot = o.deliverySlot;
    const key = slot?.id != null ? `slot-${slot.id}` : "no-slot";
    const existing = slotMap.get(key);
    if (existing) {
      existing.orders.push(o);
      existing.booked = existing.orders.length;
    } else {
      slotMap.set(key, {
        slotId: slot?.id ?? null,
        label: slot?.label ?? "Deliveries",
        timeRange: slot ? `${slot.startTime}–${slot.endTime}` : "",
        booked: 1,
        maxOrders: null,
        orders: [o],
      });
    }
  }

  const slots = Array.from(slotMap.values()).sort((a, b) => {
    if (a.slotId == null) return 1;
    if (b.slotId == null) return -1;
    return a.timeRange.localeCompare(b.timeRange);
  });

  for (const s of slots) {
    s.booked = s.orders.length;
    s.orders.sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));
  }

  return slots;
}

export function buildDateSlotSchedule(
  orders: DeliveryOrderRow[],
  options?: { fromYmd?: string; toYmd?: string },
): DateScheduleGroup[] {
  const from = options?.fromYmd?.trim() || undefined;
  const to = options?.toYmd?.trim() || undefined;

  const filtered = orders.filter((o) => {
    if (normalizeMainStatus(o.status) === "cancelled") return false;
    const ymd = orderDeliveryYmd(o);
    if (!ymd) return false;
    if (from && ymd < from) return false;
    if (to && ymd > to) return false;
    return true;
  });

  const byDate = new Map<string, DeliveryOrderRow[]>();
  for (const o of filtered) {
    const ymd = orderDeliveryYmd(o)!;
    const list = byDate.get(ymd) ?? [];
    list.push(o);
    byDate.set(ymd, list);
  }

  const dates = Array.from(byDate.keys()).sort();
  return dates.map((dateYmd) => ({
    dateYmd,
    slots: buildSlotGroups(byDate.get(dateYmd)!),
  }));
}

export { addDaysYmd, normalizeYmdRange } from "@/lib/date-range";
