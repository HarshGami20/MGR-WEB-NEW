export function normalizeMainOrderStatus(status: string | null | undefined): string {
  const s = status ?? "order_received";
  return s === "delivered" ? "complete" : s;
}

/** Orders marked complete or delivery-delivered cannot be edited. */
export function isOrderLockedForEdit(params: {
  status?: string | null;
  deliveryStatus?: string | null;
}): boolean {
  const main = normalizeMainOrderStatus(params.status);
  const delivery = params.deliveryStatus ?? "pending";
  return main === "complete" || delivery === "delivered";
}
