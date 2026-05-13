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
