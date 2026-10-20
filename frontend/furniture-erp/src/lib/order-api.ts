import { deliveryApiHeaders } from "@/lib/delivery-api";

export type BulkDeleteOrdersParams = {
  createdFrom: string;
  createdTo: string;
  categoryId?: number;
  branchId?: number | null;
  assignmentScope?: string;
  /** Main order status — omit for any. */
  status?: string;
  /** pending | out_for_delivery | delivered — omit for any. */
  deliveryStatus?: string;
  /** due | partially_paid | paid — omit for any. */
  paymentStatus?: string;
};

export type BulkDeletePreviewRow = {
  id: number;
  orderNumber: string;
  customerName: string;
  customerMobile: string | null;
  status: string;
  deliveryStatus: string;
  paymentStatus: string;
  totalAmount: number;
  paidAmount: number;
  createdAt: string;
  branch: { id: number; name: string } | null;
};

export type BulkDeletePreview = {
  count: number;
  totalAmount: number;
  paidAmount: number;
  page: number;
  limit: number;
  data: BulkDeletePreviewRow[];
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

/** Shared filter fields for preview (query string) and delete (JSON body). */
function bulkDeleteFilterFields(params: BulkDeleteOrdersParams): Record<string, string> {
  const fields: Record<string, string> = {
    createdFrom: params.createdFrom,
    createdTo: params.createdTo,
  };
  if (params.categoryId != null) fields.categoryId = String(params.categoryId);
  if (params.branchId != null && Number.isFinite(params.branchId)) {
    fields.branchId = String(params.branchId);
  }
  if (params.assignmentScope?.trim()) fields.assignmentScope = params.assignmentScope.trim();
  if (params.status?.trim()) fields.status = params.status.trim();
  if (params.deliveryStatus?.trim()) fields.deliveryStatus = params.deliveryStatus.trim();
  if (params.paymentStatus?.trim()) fields.paymentStatus = params.paymentStatus.trim();
  return fields;
}

export async function previewBulkDeleteOrders(
  params: BulkDeleteOrdersParams,
  paging: { page: number; limit: number } = { page: 1, limit: 20 },
): Promise<BulkDeletePreview> {
  const q = new URLSearchParams({
    ...bulkDeleteFilterFields(params),
    page: String(paging.page),
    limit: String(paging.limit),
  });
  const r = await fetch(`/api/orders/bulk-delete/preview?${q.toString()}`, {
    headers: deliveryApiHeaders(params.branchId),
  });
  if (!r.ok) throw new Error(await parseOrderApiError(r));
  return r.json() as Promise<BulkDeletePreview>;
}

export async function bulkDeleteOrders(
  params: BulkDeleteOrdersParams,
): Promise<{ deleted: number; failed: number; total: number }> {
  const r = await fetch("/api/orders/bulk-delete", {
    method: "POST",
    headers: { ...deliveryApiHeaders(params.branchId), "Content-Type": "application/json" },
    body: JSON.stringify(bulkDeleteFilterFields(params)),
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
