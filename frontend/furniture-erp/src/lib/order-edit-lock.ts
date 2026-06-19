export function normalizeMainOrderStatus(status: string | null | undefined): string {
  const s = String(status ?? "order_received")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (s === "complete" || s === "completed") return "delivered";
  return s;
}

/** Orders marked delivered cannot be edited. */
export function isOrderLockedForEdit(params: {
  status?: string | null;
  deliveryStatus?: string | null;
}): boolean {
  const main = normalizeMainOrderStatus(params.status);
  const delivery = params.deliveryStatus ?? "pending";
  return main === "delivered" || delivery === "delivered";
}
