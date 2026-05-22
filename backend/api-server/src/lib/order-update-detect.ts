import type { Order } from "@prisma/client";

function normStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function normNum(v: unknown): string {
  if (v == null) return "0";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : String(v);
}

const SCALAR_FIELDS = [
  "customerName",
  "customerMobile",
  "customerAddress",
  "customerPincode",
  "customerGstNumber",
  "subtotal",
  "taxAmount",
  "deliveryCharge",
  "totalAmount",
  "advanceAmount",
  "paymentMode",
  "paymentStatus",
  "driverId",
  "deliveryDate",
  "deliverySlotId",
  "branchId",
  "assignedToId",
  "isGst",
] as const satisfies readonly (keyof Order)[];

export function assigneeIdsKey(ids: number[]): string {
  if (ids.length === 0) return "";
  return [...ids].sort((a, b) => a - b).join(",");
}

/** True when PUT changed something other than main status or delivery status. */
export function orderHasNonWorkflowFieldChanges(before: Order, after: Order): boolean {
  for (const key of SCALAR_FIELDS) {
    const a = before[key];
    const b = after[key];
    if (key === "deliveryDate") {
      const da = a instanceof Date ? a.toISOString() : normStr(a);
      const db = b instanceof Date ? b.toISOString() : normStr(b);
      if (da !== db) return true;
      continue;
    }
    if (typeof a === "boolean" || typeof b === "boolean") {
      if (Boolean(a) !== Boolean(b)) return true;
      continue;
    }
    if (typeof a === "number" || typeof b === "number") {
      if (normNum(a) !== normNum(b)) return true;
      continue;
    }
    if (normStr(a) !== normStr(b)) return true;
  }
  return false;
}
