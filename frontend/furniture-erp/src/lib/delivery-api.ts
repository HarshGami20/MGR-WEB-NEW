const TOKEN_KEY = "erp_token";

export function deliveryApiHeaders(branchId?: number | null): HeadersInit {
  const h: Record<string, string> = {};
  const token = typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  if (token) h.Authorization = `Bearer ${token}`;
  if (branchId != null && Number.isFinite(branchId)) h["X-Branch-Id"] = String(branchId);
  return h;
}

export type AvailableDeliverySlot = {
  id: number;
  label: string;
  startTime: string;
  endTime: string;
  maxOrders: number;
  bookedCount: number;
  remaining: number;
  servicePincodes: string[];
};

export async function fetchAvailableDeliverySlots(params: {
  branchId: number;
  date: string;
  pincode?: string;
  excludeOrderId?: number;
}): Promise<AvailableDeliverySlot[]> {
  const q = new URLSearchParams({ date: params.date, branchId: String(params.branchId) });
  if (params.pincode?.trim()) q.set("pincode", params.pincode.trim());
  if (params.excludeOrderId != null && Number.isFinite(params.excludeOrderId)) {
    q.set("excludeOrderId", String(params.excludeOrderId));
  }
  const r = await fetch(`/api/delivery-slots/available?${q.toString()}`, {
    headers: deliveryApiHeaders(params.branchId),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || r.statusText);
  }
  const j = await r.json();
  return (j.data ?? []) as AvailableDeliverySlot[];
}

export type DeliverySlotRow = {
  id: number;
  branchId: number;
  slotDate: string;
  label: string;
  startTime: string;
  endTime: string;
  maxOrders: number;
  servicePincodes: string[];
  bookedCount: number;
  remaining: number;
};

export async function fetchDeliverySlots(params: {
  branchId: number;
  from: string;
  to: string;
}): Promise<DeliverySlotRow[]> {
  const q = new URLSearchParams({
    branchId: String(params.branchId),
    from: params.from,
    to: params.to,
  });
  const r = await fetch(`/api/delivery-slots?${q.toString()}`, {
    headers: deliveryApiHeaders(params.branchId),
  });
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();
  return (j.data ?? []) as DeliverySlotRow[];
}

export async function createDeliverySlotsBatch(
  branchId: number,
  body: {
    fromDate: string;
    toDate: string;
    weekdays: number[];
    timeMode: "morning" | "afternoon" | "evening" | "full_day" | "custom";
    startTime?: string;
    endTime?: string;
    labelPrefix?: string;
    maxOrders: number;
    servicePincodes?: string[];
  },
): Promise<{ created: number; skippedDuplicates: number; skippedOverflow: number }> {
  const r = await fetch("/api/delivery-slots/batch", {
    method: "POST",
    headers: { ...deliveryApiHeaders(branchId), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ created: number; skippedDuplicates: number; skippedOverflow: number }>;
}

export async function createDeliverySlot(
  branchId: number,
  body: {
    slotDate: string;
    label: string;
    startTime: string;
    endTime: string;
    maxOrders: number;
    servicePincodes?: string[];
  },
): Promise<unknown> {
  const r = await fetch("/api/delivery-slots", {
    method: "POST",
    headers: { ...deliveryApiHeaders(branchId), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateDeliverySlot(
  branchId: number,
  id: number,
  body: Partial<{
    slotDate: string;
    label: string;
    startTime: string;
    endTime: string;
    maxOrders: number;
    servicePincodes: string[];
  }>,
): Promise<unknown> {
  const r = await fetch(`/api/delivery-slots/${id}`, {
    method: "PUT",
    headers: { ...deliveryApiHeaders(branchId), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteDeliverySlot(branchId: number, id: number): Promise<void> {
  const r = await fetch(`/api/delivery-slots/${id}`, {
    method: "DELETE",
    headers: deliveryApiHeaders(branchId),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function patchOrderDelivery(
  orderId: number,
  branchId: number | null | undefined,
  body: { deliveryStatus?: "pending" | "out_for_delivery" | "delivered"; deliverySlotId?: number | null },
): Promise<unknown> {
  const r = await fetch(`/api/orders/${orderId}/delivery`, {
    method: "PATCH",
    headers: { ...deliveryApiHeaders(branchId), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
