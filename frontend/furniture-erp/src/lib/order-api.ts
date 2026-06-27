import { deliveryApiHeaders } from "@/lib/delivery-api";

export type BulkDeleteOrdersParams = {
  createdFrom: string;
  createdTo: string;
  categoryId?: number;
  branchId?: number | null;
  assignmentScope?: string;
};

async function parseOrderApiError(r: Response): Promise<string> {
  let message = r.statusText;
  try {
    const j = (await r.json()) as { error?: string };
    if (j.error) message = j.error;
  } catch {
    const t = await r.text();
    if (t) message = t;
  }
  return message;
}

export async function previewBulkDeleteOrders(
  params: BulkDeleteOrdersParams,
): Promise<{ count: number }> {
  const q = new URLSearchParams({
    createdFrom: params.createdFrom,
    createdTo: params.createdTo,
  });
  if (params.categoryId != null) q.set("categoryId", String(params.categoryId));
  if (params.branchId != null && Number.isFinite(params.branchId)) {
    q.set("branchId", String(params.branchId));
  }
  if (params.assignmentScope?.trim()) q.set("assignmentScope", params.assignmentScope.trim());
  const r = await fetch(`/api/orders/bulk-delete/preview?${q.toString()}`, {
    headers: deliveryApiHeaders(params.branchId),
  });
  if (!r.ok) throw new Error(await parseOrderApiError(r));
  return r.json() as Promise<{ count: number }>;
}

export async function bulkDeleteOrders(
  params: BulkDeleteOrdersParams,
): Promise<{ deleted: number; failed: number; total: number }> {
  const r = await fetch("/api/orders/bulk-delete", {
    method: "POST",
    headers: { ...deliveryApiHeaders(params.branchId), "Content-Type": "application/json" },
    body: JSON.stringify({
      createdFrom: params.createdFrom,
      createdTo: params.createdTo,
      ...(params.categoryId != null ? { categoryId: String(params.categoryId) } : {}),
      ...(params.branchId != null && Number.isFinite(params.branchId)
        ? { branchId: String(params.branchId) }
        : {}),
      ...(params.assignmentScope?.trim() ? { assignmentScope: params.assignmentScope.trim() } : {}),
    }),
  });
  if (!r.ok) throw new Error(await parseOrderApiError(r));
  return r.json() as Promise<{ deleted: number; failed: number; total: number }>;
}

export type OrderPaymentStatus = "due" | "partially_paid" | "paid";

export type OrderStaffCommentRow = {
  comment: string;
  authorName?: string | null;
  createdAt: string;
};

export async function patchOrderStaffComments(
  orderId: number,
  branchId: number | null | undefined,
  staffComments: OrderStaffCommentRow[],
): Promise<unknown> {
  const r = await fetch(`/api/orders/${orderId}/staff-comments`, {
    method: "PATCH",
    headers: { ...deliveryApiHeaders(branchId), "Content-Type": "application/json" },
    body: JSON.stringify({ staffComments }),
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
