import type { DeliveryStatusValue } from "@/lib/delivery-stats";

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatusValue, string> = {
  pending: "Pending",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};

export function deliveryStatusBadgeClass(s: DeliveryStatusValue): string {
  switch (s) {
    case "pending":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "out_for_delivery":
      return "bg-sky-100 text-sky-900 border-sky-200";
    case "delivered":
      return "bg-emerald-100 text-emerald-900 border-emerald-200";
  }
}

export function deliveriesPageHref(fromYmd: string, toYmd: string): string {
  const params = new URLSearchParams({ from: fromYmd, to: toYmd });
  return `/deliveries?${params.toString()}`;
}
