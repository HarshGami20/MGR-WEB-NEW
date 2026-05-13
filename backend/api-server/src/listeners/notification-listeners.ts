import { appEvents, type OrderCreatedPayload, type PaymentReceivedPayload } from "../lib/app-events";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { notificationService } from "../services/notification-service";

const evLog = logger.child({ ns: "notifications", layer: "events" });

/**
 * Register once at process startup. Handlers are async and non-blocking for HTTP.
 */
export function registerNotificationEventListeners(): void {
  appEvents.on("ORDER_CREATED", (payload: OrderCreatedPayload) => {
    void (async () => {
      try {
        const targets = new Set<number>();
        if (payload.assignedToId) targets.add(payload.assignedToId);
        if (payload.createdById && payload.createdById !== payload.assignedToId) {
          targets.add(payload.createdById);
        }
        if (targets.size === 0) {
          evLog.debug({ orderId: payload.orderId }, "ORDER_CREATED: no notification targets");
          return;
        }
        evLog.info(
          { orderId: payload.orderId, targetUserIds: [...targets], type: "ORDER_CREATED" },
          "domain event → notifications",
        );
        await notificationService.sendToUsers(
          [...targets],
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

  appEvents.on("PAYMENT_RECEIVED", (payload: PaymentReceivedPayload) => {
    void (async () => {
      try {
        const order = await prisma.order.findUnique({
          where: { id: payload.orderId },
          select: { orderNumber: true, assignedToId: true },
        });
        if (!order?.assignedToId) {
          evLog.debug({ orderId: payload.orderId }, "PAYMENT_RECEIVED: no assignee — skip notify");
          return;
        }
        evLog.info(
          {
            orderId: payload.orderId,
            assigneeId: order.assignedToId,
            type: "PAYMENT_RECEIVED",
          },
          "domain event → notifications",
        );
        await notificationService.sendToUser(
          order.assignedToId,
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
