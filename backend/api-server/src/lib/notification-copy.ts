import type { Prisma } from "@prisma/client";
import { formatInr } from "./format-currency";
import { prisma } from "./prisma";
import { purchaseOrderPartnerLabel } from "./notification-targets";

export type NotificationCopy = {
  title: string;
  message: string;
  actionPath: string;
};

export async function actorName(userId: number | null | undefined): Promise<string | null> {
  if (userId == null) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return u?.name?.trim() || null;
}

function byActor(name: string | null): string {
  return name ? ` by ${name}` : "";
}

export function humanizeToken(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function orderActionPath(orderId: number): string {
  return `/orders/${orderId}`;
}

export function complaintActionPath(complaintId: number): string {
  return `/complaints/${complaintId}`;
}

export function purchaseOrderActionPath(purchaseOrderId: number): string {
  return `/purchase-orders/${purchaseOrderId}`;
}

export function paymentsListPath(orderId?: number): string {
  return orderId != null ? `/payments?orderId=${orderId}` : "/payments";
}

export function deliveriesPath(): string {
  return "/deliveries";
}

export async function copyOrderCreated(input: {
  orderId: number;
  orderNumber: string;
  createdById?: number | null;
}): Promise<NotificationCopy> {
  const who = byActor(await actorName(input.createdById));
  return {
    title: "New sales order",
    message: `Order ${input.orderNumber} was created${who}. Open the order to review items and delivery.`,
    actionPath: orderActionPath(input.orderId),
  };
}

export async function copyOrderStatusChanged(input: {
  orderId: number;
  orderNumber: string;
  previousStatus: string;
  nextStatus: string;
  changedById?: number | null;
}): Promise<NotificationCopy> {
  const who = byActor(await actorName(input.changedById));
  return {
    title: "Order status changed",
    message: `Order ${input.orderNumber} moved from ${humanizeToken(input.previousStatus)} to ${humanizeToken(input.nextStatus)}${who}.`,
    actionPath: orderActionPath(input.orderId),
  };
}

export async function copyOrderDeliveryUpdated(input: {
  orderId: number;
  orderNumber: string;
  previousDeliveryStatus: string;
  nextDeliveryStatus: string;
  changedById?: number | null;
}): Promise<NotificationCopy> {
  const who = byActor(await actorName(input.changedById));
  const prev =
    input.previousDeliveryStatus === "out_for_delivery"
      ? "Out for delivery"
      : humanizeToken(input.previousDeliveryStatus);
  const next =
    input.nextDeliveryStatus === "out_for_delivery"
      ? "Out for delivery"
      : humanizeToken(input.nextDeliveryStatus);
  return {
    title: "Delivery status updated",
    message: `Order ${input.orderNumber}: delivery ${prev} → ${next}${who}.`,
    actionPath: orderActionPath(input.orderId),
  };
}

export function copyPaymentReceived(input: {
  orderId: number;
  orderNumber: string;
  amount: string;
}): NotificationCopy {
  const amt = Number(input.amount);
  const amountText = Number.isFinite(amt) ? formatInr(amt) : input.amount;
  return {
    title: "Payment received",
    message: `${amountText} recorded for order ${input.orderNumber}. View payment history on the order.`,
    actionPath: orderActionPath(input.orderId),
  };
}

function formatPaymentStatusLabel(status: string): string {
  if (status === "partially_paid") return "Partially paid";
  if (status === "paid") return "Paid";
  if (status === "due") return "Due";
  return humanizeToken(status);
}

export function copyPaymentStatusChanged(input: {
  orderId: number;
  orderNumber: string;
  previousPaymentStatus: string;
  nextPaymentStatus: string;
}): NotificationCopy {
  const prev = formatPaymentStatusLabel(input.previousPaymentStatus);
  const next = formatPaymentStatusLabel(input.nextPaymentStatus);
  return {
    title: "Payment status updated",
    message: `Order ${input.orderNumber}: payment status changed from ${prev} to ${next}.`,
    actionPath: orderActionPath(input.orderId),
  };
}

export async function copyPaymentFollowUpScheduled(input: {
  orderId: number;
  orderNumber: string;
  followUpDate: string;
  createdById?: number | null;
}): Promise<NotificationCopy> {
  const who = byActor(await actorName(input.createdById));
  return {
    title: "Payment follow-up scheduled",
    message: `Order ${input.orderNumber}: collection follow-up set for ${input.followUpDate}${who}.`,
    actionPath: orderActionPath(input.orderId),
  };
}

export function copyPaymentReminder(input: {
  orderId: number;
  orderNumber: string;
  followUpDate: string;
  overdue: boolean;
}): NotificationCopy {
  return {
    title: input.overdue ? "Payment follow-up overdue" : "Payment follow-up due today",
    message: input.overdue
      ? `Order ${input.orderNumber}: payment follow-up was due on ${input.followUpDate}. Collect or reschedule on the order.`
      : `Order ${input.orderNumber}: payment follow-up is due today (${input.followUpDate}).`,
    actionPath: orderActionPath(input.orderId),
  };
}

export function copyDeliveryReminder(input: {
  orderId: number;
  orderNumber: string;
  deliveryStatus: string;
}): NotificationCopy {
  const status =
    input.deliveryStatus === "out_for_delivery"
      ? "out for delivery"
      : "scheduled for delivery";
  return {
    title: "Delivery due today",
    message: `Order ${input.orderNumber} is ${status} today. Open deliveries or the order to confirm dispatch.`,
    actionPath: deliveriesPath(),
  };
}

export async function copyComplaintCreated(input: {
  complaintId: number;
  complaintNumber: string;
  kind: "sales_order" | "purchase_order";
  poNumber?: string;
  createdById: number | null;
}): Promise<NotificationCopy> {
  const who = byActor(await actorName(input.createdById));
  const context =
    input.kind === "purchase_order"
      ? input.poNumber
        ? ` for purchase order ${input.poNumber}`
        : " for a purchase order"
      : "";
  return {
    title: input.kind === "purchase_order" ? "New PO complaint" : "New complaint logged",
    message: `Complaint ${input.complaintNumber}${context} was opened${who}. Review details and respond on the complaint.`,
    actionPath: complaintActionPath(input.complaintId),
  };
}

export async function copyComplaintStatusChanged(input: {
  complaintId: number;
  complaintNumber: string;
  previousStatus: string;
  nextStatus: string;
  changedById?: number | null;
}): Promise<NotificationCopy> {
  const who = byActor(await actorName(input.changedById));
  return {
    title: "Complaint status updated",
    message: `${input.complaintNumber} changed from ${humanizeToken(input.previousStatus)} to ${humanizeToken(input.nextStatus)}${who}.`,
    actionPath: complaintActionPath(input.complaintId),
  };
}

export async function copyComplaintCommentAdded(input: {
  complaintId: number;
  complaintNumber: string;
  authorId: number;
}): Promise<NotificationCopy> {
  const who = (await actorName(input.authorId)) ?? "Someone";
  return {
    title: "New complaint comment",
    message: `${who} added a comment on ${input.complaintNumber}. Open the complaint to read and reply.`,
    actionPath: complaintActionPath(input.complaintId),
  };
}

export async function copyPurchaseOrderCreated(input: {
  purchaseOrderId: number;
  poNumber: string;
  type: string;
  createdById?: number | null;
}): Promise<NotificationCopy> {
  const partner = purchaseOrderPartnerLabel(input.type).toLowerCase();
  const who = byActor(await actorName(input.createdById));
  return {
    title: "New purchase order",
    message: `PO ${input.poNumber} (${partner} order) was created${who}. Open the purchase order for line items, delivery date, and status.`,
    actionPath: purchaseOrderActionPath(input.purchaseOrderId),
  };
}

export async function copyPurchaseOrderUpdated(input: {
  purchaseOrderId: number;
  poNumber: string;
  type: string;
  updatedById?: number | null;
}): Promise<NotificationCopy> {
  const partner = purchaseOrderPartnerLabel(input.type).toLowerCase();
  const who = byActor(await actorName(input.updatedById));
  return {
    title: "Purchase order details updated",
    message: `PO ${input.poNumber} notes or delivery details were changed by MGR CASA${who}. Check your ${partner} order.`,
    actionPath: purchaseOrderActionPath(input.purchaseOrderId),
  };
}

export async function copyPurchaseOrderStatusChanged(input: {
  purchaseOrderId: number;
  poNumber: string;
  type: string;
  previousStatus: string;
  nextStatus: string;
  changedByPartner: boolean;
  changedById?: number | null;
}): Promise<NotificationCopy> {
  const partner = purchaseOrderPartnerLabel(input.type);
  const statusMsg = `${humanizeToken(input.previousStatus)} → ${humanizeToken(input.nextStatus)}`;

  if (input.changedByPartner) {
    const who = byActor(await actorName(input.changedById));
    return {
      title: `${partner} updated order status`,
      message: `PO ${input.poNumber}: ${partner} marked status ${statusMsg}${who}.`,
      actionPath: purchaseOrderActionPath(input.purchaseOrderId),
    };
  }

  return {
    title: "Purchase order status updated",
    message: `PO ${input.poNumber} is now ${humanizeToken(input.nextStatus)} (was ${humanizeToken(input.previousStatus)}). MGR CASA updated your ${partner.toLowerCase()} order.`,
    actionPath: purchaseOrderActionPath(input.purchaseOrderId),
  };
}

/** Merge domain metadata with actionPath for client deep links. */
export function withActionMeta(
  actionPath: string,
  meta: Record<string, unknown>,
): Prisma.JsonValue {
  return { ...meta, actionPath } as Prisma.JsonValue;
}
