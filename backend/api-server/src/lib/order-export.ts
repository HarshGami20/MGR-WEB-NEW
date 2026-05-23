import type { Prisma } from "@prisma/client";
import { orderHasProductInCategories } from "./category-filter";
import { formatInr } from "./format-currency";
import { prisma, toNumber } from "./prisma";

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value?.trim()) return fallback;
  try {
    const parsed = JSON.parse(value) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function formatDt(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDateOnly(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatLineItems(
  items: Array<{
    isCustom: boolean;
    quantity: number;
    unitPrice: unknown;
    totalPrice: unknown;
    customName?: string | null;
    description?: string | null;
    product?: { name?: string; category?: { name?: string } | null } | null;
  }>,
): string {
  return items
    .map((item) => {
      const name = item.isCustom
        ? item.customName ?? "Custom item"
        : item.product?.name ?? "Product";
      const cat = item.product?.category?.name;
      const label = cat ? `${name} (${cat})` : name;
      const desc = item.description?.trim();
      const extra = desc ? ` — ${desc}` : "";
      return `${label}${extra} x${item.quantity} @ ${formatInr(toNumber(item.unitPrice))} = ${formatInr(toNumber(item.totalPrice))}`;
    })
    .join("; ");
}

function formatPayments(
  payments: Array<{ amount: unknown; mode: string; createdAt: Date; chequeNumber?: string | null; notes?: string | null }>,
): string {
  if (!payments.length) return "No payments";
  return payments
    .map((p) => {
      const parts = [formatInr(toNumber(p.amount)), p.mode, formatDt(p.createdAt)];
      if (p.chequeNumber?.trim()) parts.push(`Cheque ${p.chequeNumber.trim()}`);
      if (p.notes?.trim()) parts.push(p.notes.trim());
      return parts.join(" · ");
    })
    .join("; ");
}

function formatCommentList(
  rows: Array<{ comment?: string; authorName?: string; createdAt?: string }> | undefined,
): string {
  if (!rows?.length) return "";
  return rows
    .map((r) => {
      const text = r.comment?.trim() || "—";
      const who = r.authorName?.trim();
      const when = r.createdAt ? formatDt(r.createdAt) : "";
      return [text, who, when].filter(Boolean).join(" · ");
    })
    .join("; ");
}

function formatPhotoComments(
  rows: Array<{ imageUrl?: string; comment?: string }> | undefined,
): string {
  if (!rows?.length) return "";
  return rows
    .map((r, i) => {
      const c = r.comment?.trim() || "—";
      return `Photo ${i + 1}: ${c}`;
    })
    .join("; ");
}

export type OrderExportRow = Record<string, string | number>;

export async function buildOrderExportRows(
  createdAt?: { gte?: Date; lt?: Date },
  branchId?: number | null,
  categoryIds?: number[] | null,
): Promise<OrderExportRow[]> {
  const where: Prisma.OrderWhereInput = {};
  if (branchId != null && branchId > 0) where.branchId = branchId;
  if (createdAt?.gte || createdAt?.lt) {
    where.createdAt = {};
    if (createdAt.gte) where.createdAt.gte = createdAt.gte;
    if (createdAt.lt) where.createdAt.lt = createdAt.lt;
  }
  if (categoryIds?.length) {
    Object.assign(where, orderHasProductInCategories(categoryIds));
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      branch: { select: { name: true } },
      createdBy: { select: { name: true } },
      assignees: { include: { user: { select: { name: true } } } },
      deliveryAssignees: { include: { user: { select: { name: true } } } },
      items: {
        include: {
          product: { select: { name: true, category: { select: { name: true } } } },
        },
      },
      payments: { orderBy: [{ createdAt: "asc" }] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return orders.map((order) => {
    const total = toNumber(order.totalAmount);
    const paid = toNumber(order.paidAmount);
    const balance = Math.max(0, total - paid);
    const assignees = order.assignees.map((a) => a.user.name).filter(Boolean).join(", ");
    const deliveryAssignees = order.deliveryAssignees.map((a) => a.user.name).filter(Boolean).join(", ");
    const staffComments = safeJsonParse<Array<{ comment?: string; authorName?: string; createdAt?: string }>>(
      order.staffComments,
      [],
    );
    const deliveryComments = safeJsonParse<Array<{ comment?: string; authorName?: string; createdAt?: string }>>(
      order.deliveryComments,
      [],
    );
    const photoComments = safeJsonParse<Array<{ imageUrl?: string; comment?: string }>>(order.photoComments, []);

    return {
      "Order Number": order.orderNumber,
      "Order ID": order.id,
      "Customer Name": order.customerName,
      "Mobile": order.customerMobile ?? "",
      "Address": order.customerAddress ?? "",
      "Pincode": order.customerPincode ?? "",
      "Customer GSTIN": order.customerGstNumber ?? "",
      "GST Order": order.isGst ? "Yes" : "No",
      Branch: order.branch?.name ?? "",
      "Order Date": formatDt(order.createdAt),
      "Delivery Date": formatDateOnly(order.deliveryDate),
      "Order Status": order.status,
      "Delivery Status": order.deliveryStatus,
      "Payment Status": order.paymentStatus,
      "Payment Mode": order.paymentMode ?? "",
      Subtotal: toNumber(order.subtotal),
      "Tax (GST)": toNumber(order.taxAmount),
      "Total Amount": total,
      "Paid Amount": paid,
      "Balance Due": balance,
      "Advance Amount": toNumber(order.advanceAmount),
      "Line Items": formatLineItems(order.items),
      Payments: formatPayments(order.payments),
      "Created By": order.createdBy?.name ?? "",
      Assignees: assignees,
      "Delivery Assignees": deliveryAssignees,
      "Staff Comments": formatCommentList(staffComments),
      "Delivery Comments": formatCommentList(deliveryComments),
      "Site Photo Comments": formatPhotoComments(photoComments),
      Notes: order.notes ?? "",
    };
  });
}
