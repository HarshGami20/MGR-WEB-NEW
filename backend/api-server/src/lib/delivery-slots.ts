import type { Prisma, PrismaClient } from "@prisma/client";

export const DELIVERY_STATUSES = new Set(["pending", "out_for_delivery", "delivered"]);

export function parseServicePincodes(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const a = JSON.parse(json) as unknown;
    if (!Array.isArray(a)) return [];
    return a.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Empty list = serves all pincodes. */
export function slotServesPincode(servicePincodesJson: string, pincode: string | null | undefined): boolean {
  const list = parseServicePincodes(servicePincodesJson);
  if (list.length === 0) return true;
  const p = (pincode ?? "").trim();
  if (!p) return false;
  return list.includes(p);
}

export function normalizeMainOrderStatus(status: string | null | undefined): string {
  const s = status ?? "order_received";
  return s === "delivered" ? "complete" : s;
}

export function normalizeDeliveryStatus(s: string | null | undefined): string {
  if (s && DELIVERY_STATUSES.has(s)) return s;
  return "pending";
}

export function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Compare calendar day in UTC (matches @db.Date storage). */
export function sameUtcDate(a: Date, b: Date): boolean {
  const ua = utcDateOnly(a).getTime();
  const ub = utcDateOnly(b).getTime();
  return ua === ub;
}

export async function countOrdersInSlot(
  prisma: PrismaClient | Prisma.TransactionClient,
  slotId: number,
  excludeOrderId?: number,
): Promise<number> {
  return prisma.order.count({
    where: {
      deliverySlotId: slotId,
      status: { not: "cancelled" },
      ...(excludeOrderId != null ? { id: { not: excludeOrderId } } : {}),
    },
  });
}

export function parseDeliveryDateInput(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date && !Number.isNaN(input.getTime())) return utcDateOnly(input);
  const s = String(input).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  return new Date(Date.UTC(y, mo, d));
}

/** Prefer least-filled slot that serves the pincode; null if none. */
export async function pickBestDeliverySlot(
  prisma: PrismaClient | Prisma.TransactionClient,
  params: { branchId: number; deliveryDate: Date; pincode: string | null | undefined; excludeOrderId?: number },
): Promise<number | null> {
  const day = utcDateOnly(params.deliveryDate);
  const slots = await prisma.deliverySlot.findMany({
    where: { branchId: params.branchId, slotDate: day },
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
  });
  const candidates = slots.filter((s) => slotServesPincode(s.servicePincodes, params.pincode));
  const scored: Array<{ id: number; used: number }> = [];
  for (const s of candidates) {
    const used = await countOrdersInSlot(prisma, s.id, params.excludeOrderId);
    if (used < s.maxOrders) scored.push({ id: s.id, used });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => a.used - b.used || a.id - b.id);
  return scored[0]!.id;
}
