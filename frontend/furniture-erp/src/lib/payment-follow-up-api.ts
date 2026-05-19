import { customFetch } from "@/api-client/custom-fetch";

export type PaymentFollowUpRow = {
  id: number;
  orderId: number;
  followUpDate: string;
  note: string;
  createdAt: string;
  createdBy: { id: number; name: string; mobile: string; avatarUrl: string | null } | null;
  order?: {
    id: number;
    orderNumber: string;
    customerName: string;
    customerMobile: string | null;
    paymentStatus: string;
    totalAmount: number;
    paidAmount: number;
    balanceDue: number;
    branchId: number | null;
  } | null;
};

export type PaymentFollowUpsByDateResponse = {
  data: PaymentFollowUpRow[];
  date: string;
};

export type PaymentFollowUpRemindersResponse = {
  data: PaymentFollowUpRow[];
  overdue: PaymentFollowUpRow[];
  dueToday: PaymentFollowUpRow[];
  counts: { total: number; overdue: number; dueToday: number };
};

export async function listPaymentFollowUpsByDate(params: {
  date: string;
  branchId?: number | null;
}): Promise<PaymentFollowUpsByDateResponse> {
  const qs = new URLSearchParams({ date: params.date });
  if (params.branchId != null) qs.set("branchId", String(params.branchId));
  return customFetch<PaymentFollowUpsByDateResponse>(`/api/payment-follow-ups?${qs}`);
}

export async function listPaymentFollowUpReminders(branchId?: number | null): Promise<PaymentFollowUpRemindersResponse> {
  const qs = new URLSearchParams();
  if (branchId != null) qs.set("branchId", String(branchId));
  const q = qs.toString();
  return customFetch<PaymentFollowUpRemindersResponse>(
    `/api/payment-follow-ups/reminders${q ? `?${q}` : ""}`,
  );
}

export async function listOrderPaymentFollowUps(orderId: number): Promise<{ data: PaymentFollowUpRow[] }> {
  return customFetch<{ data: PaymentFollowUpRow[] }>(`/api/orders/${orderId}/payment-follow-ups`);
}

export async function createOrderPaymentFollowUp(
  orderId: number,
  body: { followUpDate: string; note: string },
): Promise<PaymentFollowUpRow> {
  return customFetch<PaymentFollowUpRow>(`/api/orders/${orderId}/payment-follow-ups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const PENDING_PAYMENT_STATUSES = ["due", "partially_paid"] as const;

export function isPendingPaymentStatus(status: string | null | undefined): boolean {
  return status === "due" || status === "partially_paid";
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  due: "Due",
  partially_paid: "Partially Paid",
  paid: "Paid",
};

/** Human-readable payment status for UI (e.g. `partially_paid` → "Partially Paid"). */
export function formatPaymentStatusLabel(status: string | null | undefined): string {
  if (!status) return PAYMENT_STATUS_LABELS.due;
  return PAYMENT_STATUS_LABELS[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
