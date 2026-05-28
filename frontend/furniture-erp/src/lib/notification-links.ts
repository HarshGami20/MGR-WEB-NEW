import type { NotificationRow } from "@/lib/notification-api";

type Meta = Record<string, unknown>;

function asMeta(raw: unknown): Meta | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Meta;
}

/** Deep link path for a notification (bell, inbox, push). */
export function notificationHref(row: NotificationRow): string | null {
  const meta = asMeta(row.metadata);
  if (meta) {
    const actionPath = meta.actionPath;
    if (typeof actionPath === "string" && actionPath.startsWith("/")) {
      return actionPath;
    }
  }

  switch (row.notificationType) {
    case "ORDER_CREATED":
    case "ORDER_STATUS_CHANGED":
    case "ORDER_DELIVERY_UPDATED":
    case "PAYMENT_RECEIVED":
    case "ORDER_PAYMENT_STATUS_CHANGED":
    case "PAYMENT_REMINDER":
      if (meta && typeof meta.orderId === "number") return `/orders/${meta.orderId}`;
      break;
    case "DELIVERY_REMINDER":
      if (meta && typeof meta.orderId === "number") return `/orders/${meta.orderId}`;
      return "/deliveries";
    case "COMPLAINT_CREATED":
    case "COMPLAINT_STATUS_CHANGED":
    case "COMPLAINT_COMMENT_ADDED":
      if (meta && typeof meta.complaintId === "number") return `/complaints/${meta.complaintId}`;
      break;
    case "PURCHASE_ORDER_CREATED":
    case "PURCHASE_ORDER_UPDATED":
    case "PURCHASE_ORDER_STATUS_CHANGED":
      if (meta && typeof meta.purchaseOrderId === "number") {
        return `/purchase-orders/${meta.purchaseOrderId}`;
      }
      break;
    default:
      break;
  }

  if (meta) {
    if (typeof meta.complaintId === "number") return `/complaints/${meta.complaintId}`;
    if (typeof meta.purchaseOrderId === "number") return `/purchase-orders/${meta.purchaseOrderId}`;
    if (typeof meta.orderId === "number") return `/orders/${meta.orderId}`;
  }

  if (row.module === "purchaseOrders") return "/purchase-orders";
  if (row.module === "complaints") return "/complaints";
  if (row.module === "deliveries") return "/deliveries";
  if (row.module === "payments") return "/payments";
  if (row.module === "orders") return "/orders";

  return null;
}

/** Short CTA label for the linked screen. */
export function notificationActionLabel(row: NotificationRow): string | null {
  const href = notificationHref(row);
  if (!href) return null;

  if (href.startsWith("/purchase-orders/")) return "View order";
  if (href.startsWith("/complaints/")) return "View complaint";
  if (href.startsWith("/orders/")) {
    if (row.notificationType === "PAYMENT_REMINDER" || row.notificationType === "PAYMENT_RECEIVED") {
      return "View order & payments";
    }
    if (row.notificationType === "DELIVERY_REMINDER" || row.module === "deliveries") {
      return "View order";
    }
    return "View order";
  }
  if (href === "/deliveries") return "Open deliveries";
  if (href.startsWith("/payments")) return "Open payments";

  return "View details";
}

export function notificationPayloadHref(payload: {
  metadata?: unknown;
  notificationType?: string;
  module?: string | null;
}): string | null {
  return notificationHref({
    recipientId: "",
    notificationId: "",
    title: "",
    message: "",
    notificationType: payload.notificationType ?? "",
    module: payload.module ?? null,
    metadata: payload.metadata,
    priority: "normal",
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
    senderId: null,
    scheduledAt: null,
    expiresAt: null,
  });
}
