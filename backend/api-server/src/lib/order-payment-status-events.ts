import { emitSafe } from "./app-events";

/** Emit when order payment status changes (manual update or order edit — not POST /payments). */
export function emitOrderPaymentStatusChangedIfNeeded(
  orderId: number,
  orderNumber: string,
  branchId: number | null,
  previousPaymentStatus: string | null | undefined,
  nextPaymentStatus: string | null | undefined,
  changedById?: number | null,
): void {
  const prev = String(previousPaymentStatus ?? "due");
  const next = String(nextPaymentStatus ?? "due");
  if (prev === next) return;
  emitSafe("ORDER_PAYMENT_STATUS_CHANGED", {
    orderId,
    orderNumber,
    branchId,
    previousPaymentStatus: prev,
    nextPaymentStatus: next,
    changedById: changedById ?? undefined,
  });
}
