import { EventEmitter } from "node:events";
import { logger } from "./logger";

export type OrderCreatedPayload = {
  orderId: number;
  orderNumber: string;
  branchId: number | null;
  assignedToId: number | null;
  createdById: number | undefined;
};

export type PaymentReceivedPayload = {
  orderId: number;
  paymentId: number;
  amount: string;
};

export type OrderStatusChangedPayload = {
  orderId: number;
  orderNumber: string;
  branchId: number | null;
  previousStatus: string;
  nextStatus: string;
  changedById?: number;
};

export type OrderDeliveryUpdatedPayload = {
  orderId: number;
  orderNumber: string;
  branchId: number | null;
  previousDeliveryStatus: string;
  nextDeliveryStatus: string;
  changedById?: number;
};

export type UserCreatedPayload = {
  userId: number;
  name: string;
};

export type StockLowPayload = {
  productId: number;
  sku: string;
  stockQty: number;
  threshold: number;
};

export type SystemAlertPayload = {
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
};

export type PaymentFollowUpCreatedPayload = {
  followUpId: number;
  orderId: number;
  orderNumber: string;
  branchId: number | null;
  followUpDate: string;
  createdById?: number | null;
};

export type ComplaintCreatedPayload = {
  complaintId: number;
  complaintNumber: string;
  orderId: number;
  branchId: number | null;
  createdById: number | null;
};

export type ComplaintStatusChangedPayload = {
  complaintId: number;
  complaintNumber: string;
  orderId: number;
  branchId: number | null;
  previousStatus: string;
  nextStatus: string;
  changedById?: number | null;
};

export type ComplaintCommentAddedPayload = {
  complaintId: number;
  complaintNumber: string;
  orderId: number;
  branchId: number | null;
  commentId: number;
  authorId: number;
};

export type PurchaseOrderCreatedPayload = {
  purchaseOrderId: number;
  poNumber: string;
  branchId: number | null;
  supplierId: number | null;
  manufacturerId: number | null;
  type: string;
  createdById?: number | null;
};

export type PurchaseOrderStatusChangedPayload = {
  purchaseOrderId: number;
  poNumber: string;
  branchId: number | null;
  supplierId: number | null;
  manufacturerId: number | null;
  type: string;
  previousStatus: string;
  nextStatus: string;
  changedById?: number | null;
  changedByPartner: boolean;
};

export type PurchaseOrderUpdatedPayload = {
  purchaseOrderId: number;
  poNumber: string;
  branchId: number | null;
  supplierId: number | null;
  manufacturerId: number | null;
  type: string;
  updatedById?: number | null;
};

/** Typed domain events → notification listeners (decouple HTTP routes from delivery). */
class AppEventsBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }
}

export const appEvents = new AppEventsBus();

export function emitSafe(event: string, payload: unknown): void {
  try {
    appEvents.emit(event, payload);
  } catch (err) {
    logger.error({ err, event }, "appEvents emit failed");
  }
}
