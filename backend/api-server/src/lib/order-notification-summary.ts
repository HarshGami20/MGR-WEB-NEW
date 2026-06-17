import { categoryNodeById, loadCategoryNodes, mainCategoryName, resolveMainCategoryId } from "./category-filter";
import { formatInr } from "./format-currency";
import { prisma } from "./prisma";

function humanizeStatus(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export type OrderNotificationSummary = {
  orderNumber: string;
  amount: string;
  /** Main order / job status (e.g. Manufacturing). */
  main: string;
  /** Order category label. */
  category: string;
};

export const ORDER_CATEGORY_NOT_SPECIFIED = "Not specified";

export function buildOrderNotificationSummary(input: {
  orderNumber: string;
  totalAmount: string | number | null | undefined;
  status?: string | null;
  categoryName?: string | null;
}): OrderNotificationSummary {
  const n = Number(input.totalAmount ?? 0);
  const amount = Number.isFinite(n) ? formatInr(n) : `₹${String(input.totalAmount ?? 0)}`;
  const main = input.status?.trim() ? humanizeStatus(input.status) : "—";
  const category = input.categoryName?.trim() || ORDER_CATEGORY_NOT_SPECIFIED;
  return {
    orderNumber: input.orderNumber,
    amount,
    main,
    category,
  };
}

/** Compact line for in-app notification bodies. */
export function orderNotificationSummaryText(summary: OrderNotificationSummary): string {
  return `${summary.orderNumber} · ${summary.amount} · ${summary.main} · ${summary.category}`;
}

/** Pipe-separated detail for WhatsApp `order_id` template parameters. */
export function orderNotificationWhatsAppDetail(summary: OrderNotificationSummary): string {
  return `${summary.orderNumber} | ${summary.amount} | ${summary.main} | ${summary.category}`;
}

export function appendOrderSummaryToMessage(message: string, summary: OrderNotificationSummary): string {
  return `${message}\n${orderNotificationSummaryText(summary)}`;
}

export async function loadOrderNotificationSummary(orderId: number): Promise<OrderNotificationSummary | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      totalAmount: true,
      status: true,
      categoryId: true,
      category: { select: { name: true } },
    },
  });
  if (!order) return null;

  let categoryName = order.category?.name ?? null;
  if (!categoryName && order.categoryId != null) {
    const nodes = await loadCategoryNodes();
    const byId = categoryNodeById(nodes);
    const mainId = resolveMainCategoryId(order.categoryId, byId);
    categoryName = mainCategoryName(mainId, byId);
    if (categoryName === "Uncategorized") categoryName = null;
  }

  return buildOrderNotificationSummary({
    orderNumber: order.orderNumber,
    totalAmount: String(order.totalAmount ?? 0),
    status: order.status,
    categoryName,
  });
}
