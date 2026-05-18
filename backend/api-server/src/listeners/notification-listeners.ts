import {
  appEvents,
  type OrderCreatedPayload,
  type OrderDeliveryUpdatedPayload,
  type OrderStatusChangedPayload,
  type PaymentReceivedPayload,
} from "../lib/app-events";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { notificationService } from "../services/notification-service";

const evLog = logger.child({ ns: "notifications", layer: "events" });

async function orderNotificationTargets(orderId: number): Promise<number[]> {
  const targets = new Set<number>();
  const [assignees, order] = await Promise.all([
    prisma.orderAssignee.findMany({ where: { orderId }, select: { userId: true } }),
    prisma.order.findUnique({
      where: { id: orderId },
      select: { assignedToId: true, createdById: true },
    }),
  ]);
  for (const r of assignees) targets.add(r.userId);
  if (assignees.length === 0 && order?.assignedToId) targets.add(order.assignedToId);
  if (order?.createdById) targets.add(order.createdById);
  return [...targets];
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function deliveryLabel(status: string): string {
  switch (status) {
    case "out_for_delivery":
      return "Out for delivery";
    case "delivered":
      return "Delivered";
    default:
      return "Pending";
  }
}

/**
 * Register once at process startup. Handlers are async and non-blocking for HTTP.
 */
export function registerNotificationEventListeners(): void {
  appEvents.on("ORDER_CREATED", (payload: OrderCreatedPayload) => {
    void (async () => {
      try {
        const targets = await orderNotificationTargets(payload.orderId);
        if (targets.length === 0) {
          evLog.debug({ orderId: payload.orderId }, "ORDER_CREATED: no notification targets");
          return;
        }
        evLog.info(
          { orderId: payload.orderId, targetUserIds: targets, type: "ORDER_CREATED" },
          "domain event → notifications",
        );
        await notificationService.sendToUsers(
          targets,
          {
            title: "New order",
            message: `Order ${payload.orderNumber} was created.`,
            senderId: payload.createdById ?? null,
            notificationType: "ORDER_CREATED",
            module: "orders",
            metadata: {
              orderId: payload.orderId,
              orderNumber: payload.orderNumber,
              branchId: payload.branchId,
            },
          },
          { senderUserId: payload.createdById },
        );
      } catch (err) {
        logger.error({ err }, "ORDER_CREATED notification listener failed");
      }
    })();
  });

  appEvents.on("ORDER_STATUS_CHANGED", (payload: OrderStatusChangedPayload) => {
    void (async () => {
      try {
        if (payload.previousStatus === payload.nextStatus) return;
        const targets = await orderNotificationTargets(payload.orderId);
        if (targets.length === 0) {
          evLog.debug({ orderId: payload.orderId }, "ORDER_STATUS_CHANGED: no targets");
          return;
        }
        evLog.info(
          { orderId: payload.orderId, targetUserIds: targets, type: "ORDER_STATUS_CHANGED" },
          "domain event → notifications",
        );
        await notificationService.sendToUsers(
          targets,
          {
            title: "Order status updated",
            message: `Order ${payload.orderNumber}: ${statusLabel(payload.previousStatus)} → ${statusLabel(payload.nextStatus)}.`,
            senderId: payload.changedById ?? null,
            notificationType: "ORDER_STATUS_CHANGED",
            module: "orders",
            metadata: {
              orderId: payload.orderId,
              orderNumber: payload.orderNumber,
              branchId: payload.branchId,
              previousStatus: payload.previousStatus,
              nextStatus: payload.nextStatus,
            },
          },
          { senderUserId: payload.changedById },
        );
      } catch (err) {
        logger.error({ err }, "ORDER_STATUS_CHANGED notification listener failed");
      }
    })();
  });

  appEvents.on("ORDER_DELIVERY_UPDATED", (payload: OrderDeliveryUpdatedPayload) => {
    void (async () => {
      try {
        if (payload.previousDeliveryStatus === payload.nextDeliveryStatus) return;
        const targets = await orderNotificationTargets(payload.orderId);
        if (targets.length === 0) {
          evLog.debug({ orderId: payload.orderId }, "ORDER_DELIVERY_UPDATED: no targets");
          return;
        }
        evLog.info(
          { orderId: payload.orderId, targetUserIds: targets, type: "ORDER_DELIVERY_UPDATED" },
          "domain event → notifications",
        );
        await notificationService.sendToUsers(
          targets,
          {
            title: "Delivery update",
            message: `Order ${payload.orderNumber}: ${deliveryLabel(payload.previousDeliveryStatus)} → ${deliveryLabel(payload.nextDeliveryStatus)}.`,
            senderId: payload.changedById ?? null,
            notificationType: "ORDER_DELIVERY_UPDATED",
            module: "deliveries",
            metadata: {
              orderId: payload.orderId,
              orderNumber: payload.orderNumber,
              branchId: payload.branchId,
              previousDeliveryStatus: payload.previousDeliveryStatus,
              nextDeliveryStatus: payload.nextDeliveryStatus,
            },
          },
          { senderUserId: payload.changedById },
        );
      } catch (err) {
        logger.error({ err }, "ORDER_DELIVERY_UPDATED notification listener failed");
      }
    })();
  });

  appEvents.on("PAYMENT_RECEIVED", (payload: PaymentReceivedPayload) => {
    void (async () => {
      try {
        const order = await prisma.order.findUnique({
          where: { id: payload.orderId },
          select: { orderNumber: true, assignedToId: true },
        });
        if (!order) {
          evLog.debug({ orderId: payload.orderId }, "PAYMENT_RECEIVED: order not found");
          return;
        }
        const recipientIds = await orderNotificationTargets(payload.orderId);
        if (recipientIds.length === 0) {
          evLog.debug({ orderId: payload.orderId }, "PAYMENT_RECEIVED: no assignees — skip notify");
          return;
        }
        evLog.info(
          {
            orderId: payload.orderId,
            assigneeIds: recipientIds,
            type: "PAYMENT_RECEIVED",
          },
          "domain event → notifications",
        );
        await notificationService.sendToUsers(
          recipientIds,
          {
            title: "Payment recorded",
            message: `Payment for order ${order.orderNumber} was received.`,
            notificationType: "PAYMENT_RECEIVED",
            module: "payments",
            metadata: { orderId: payload.orderId, paymentId: payload.paymentId, amount: payload.amount },
          },
          { senderUserId: null },
        );
      } catch (err) {
        logger.error({ err }, "PAYMENT_RECEIVED notification listener failed");
      }
    })();
  });
}
