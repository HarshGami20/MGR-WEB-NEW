import { isPartnerPortalUser } from "@/lib/partner";
import type { User } from "@/api-client";

/** Paths supplier / manufacturer portal users may open. */
export function partnerAllowedPath(location: string): boolean {
  if (location === "/dashboard") return true;
  if (location === "/purchase-orders") return true;
  if (/^\/purchase-orders\/\d+$/.test(location)) return true;
  if (/^\/products\/\d+$/.test(location)) return true;
  if (location === "/complaints") return true;
  if (/^\/complaints\/\d+$/.test(location)) return true;
  if (location === "/notifications") return true;
  if (location === "/settings") return true;
  return false;
}

export function partnerBackHref(
  user: User | null | undefined,
  context: "product" | "purchase-order",
  purchaseOrderId?: number,
): string {
  if (!isPartnerPortalUser(user)) {
    return context === "product" ? "/products" : "/purchase-orders";
  }
  if (context === "product" && purchaseOrderId != null) {
    return `/purchase-orders/${purchaseOrderId}`;
  }
  return context === "product" ? "/purchase-orders" : "/purchase-orders";
}
