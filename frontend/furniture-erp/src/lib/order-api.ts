import { deliveryApiHeaders } from "@/lib/delivery-api";

export type OrderPaymentStatus = "due" | "partially_paid" | "paid";

export async function patchOrderPaymentStatus(
  orderId: number,
  branchId: number | null | undefined,
  body: { paymentStatus: OrderPaymentStatus },
): Promise<unknown> {
  const r = await fetch(`/api/orders/${orderId}/payment-status`, {
    method: "PATCH",
    headers: { ...deliveryApiHeaders(branchId), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let message = r.statusText;
    try {
      const j = (await r.json()) as { error?: string };
      if (j.error) message = j.error;
    } catch {
      const t = await r.text();
      if (t) message = t;
    }
    throw new Error(message);
  }
  return r.json();
}
