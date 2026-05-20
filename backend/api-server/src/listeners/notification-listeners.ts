import {
  appEvents,
  type ComplaintCommentAddedPayload,
  type ComplaintCreatedPayload,
  type ComplaintStatusChangedPayload,
  type OrderCreatedPayload,
  type OrderDeliveryUpdatedPayload,
  type OrderStatusChangedPayload,
  type PaymentFollowUpCreatedPayload,
  type PaymentReceivedPayload,
  type PurchaseOrderCreatedPayload,
  type PurchaseOrderStatusChangedPayload,
  type PurchaseOrderUpdatedPayload,
} from "../lib/app-events";
import {
  copyComplaintCommentAdded,
  copyComplaintCreated,
  copyComplaintStatusChanged,
  copyOrderCreated,
  copyOrderDeliveryUpdated,
  copyOrderStatusChanged,
  copyPaymentFollowUpScheduled,
  copyPaymentReceived,
  copyPurchaseOrderCreated,
  copyPurchaseOrderStatusChanged,
  copyPurchaseOrderUpdated,
  withActionMeta,
} from "../lib/notification-copy";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import {
  complaintNotificationTargets,
  orderNotificationTargets,
  purchaseOrderPartnerTargets,
  purchaseOrderStaffTargets,
  startOfUtcDay,
} from "../lib/notification-targets";
import { notificationService } from "../services/notification-service";

const evLog = logger.child({ ns: "notifications", layer: "events" });

function reminderScheduledAt(followUpDateYmd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(followUpDateYmd);
  if (!m) return startOfUtcDay(new Date());
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const atNineUtc = new Date(Date.UTC(y, mo, d, 9, 0, 0, 0));
  if (atNineUtc.getTime() > Date.now()) return atNineUtc;
  return new Date(Date.now() + 2000);
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
        const copy = await copyOrderCreated({
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
          createdById: payload.createdById,
        });
        await notificationService.sendToUsers(
          targets,
          {
            title: copy.title,
            message: copy.message,
            senderId: payload.createdById ?? null,
            notificationType: "ORDER_CREATED",
            module: "orders",
            metadata: withActionMeta(copy.actionPath, {
              orderId: payload.orderId,
              orderNumber: payload.orderNumber,
              branchId: payload.branchId,
            }),
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
        if (targets.length === 0) return;
        const copy = await copyOrderStatusChanged({
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
          previousStatus: payload.previousStatus,
          nextStatus: payload.nextStatus,
          changedById: payload.changedById,
        });
        await notificationService.sendToUsers(
          targets,
          {
            title: copy.title,
            message: copy.message,
            senderId: payload.changedById ?? null,
            notificationType: "ORDER_STATUS_CHANGED",
            module: "orders",
            metadata: withActionMeta(copy.actionPath, {
              orderId: payload.orderId,
              orderNumber: payload.orderNumber,
              branchId: payload.branchId,
              previousStatus: payload.previousStatus,
              nextStatus: payload.nextStatus,
            }),
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
        if (targets.length === 0) return;
        const copy = await copyOrderDeliveryUpdated({
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
          previousDeliveryStatus: payload.previousDeliveryStatus,
          nextDeliveryStatus: payload.nextDeliveryStatus,
          changedById: payload.changedById,
        });
        await notificationService.sendToUsers(
          targets,
          {
            title: copy.title,
            message: copy.message,
            senderId: payload.changedById ?? null,
            notificationType: "ORDER_DELIVERY_UPDATED",
            module: "deliveries",
            metadata: withActionMeta(copy.actionPath, {
              orderId: payload.orderId,
              orderNumber: payload.orderNumber,
              branchId: payload.branchId,
              previousDeliveryStatus: payload.previousDeliveryStatus,
              nextDeliveryStatus: payload.nextDeliveryStatus,
            }),
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
        const recipientIds = await orderNotificationTargets(payload.orderId);
        if (recipientIds.length === 0) return;
        const order = await prisma.order.findUnique({
          where: { id: payload.orderId },
          select: { orderNumber: true },
        });
        if (!order) return;
        const copy = copyPaymentReceived({
          orderId: payload.orderId,
          orderNumber: order.orderNumber,
          amount: payload.amount,
        });
        await notificationService.sendToUsers(
          recipientIds,
          {
            title: copy.title,
            message: copy.message,
            notificationType: "PAYMENT_RECEIVED",
            module: "payments",
            metadata: withActionMeta(copy.actionPath, {
              orderId: payload.orderId,
              orderNumber: order.orderNumber,
              paymentId: payload.paymentId,
              amount: payload.amount,
            }),
          },
          { senderUserId: null },
        );
      } catch (err) {
        logger.error({ err }, "PAYMENT_RECEIVED notification listener failed");
      }
    })();
  });

  appEvents.on("PAYMENT_FOLLOW_UP_CREATED", (payload: PaymentFollowUpCreatedPayload) => {
    void (async () => {
      try {
        const targets = await orderNotificationTargets(payload.orderId);
        if (targets.length === 0) return;
        const copy = await copyPaymentFollowUpScheduled({
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
          followUpDate: payload.followUpDate,
          createdById: payload.createdById,
        });
        const scheduledAt = reminderScheduledAt(payload.followUpDate);
        await notificationService.scheduleNotification(
          targets,
          {
            title: copy.title,
            message: copy.message,
            senderId: payload.createdById ?? null,
            notificationType: "PAYMENT_REMINDER",
            module: "payments",
            metadata: withActionMeta(copy.actionPath, {
              dedupeKey: `payment-scheduled:${payload.followUpId}:${payload.followUpDate}`,
              orderId: payload.orderId,
              orderNumber: payload.orderNumber,
              followUpId: payload.followUpId,
              followUpDate: payload.followUpDate,
              branchId: payload.branchId,
            }),
          },
          scheduledAt,
          { senderUserId: payload.createdById },
        );
      } catch (err) {
        logger.error({ err }, "PAYMENT_FOLLOW_UP_CREATED notification listener failed");
      }
    })();
  });

  appEvents.on("COMPLAINT_CREATED", (payload: ComplaintCreatedPayload) => {
    void (async () => {
      try {
        const targets = await complaintNotificationTargets(
          payload.complaintId,
          payload.orderId,
          payload.branchId,
          payload.createdById,
        );
        if (targets.length === 0) return;
        const copy = await copyComplaintCreated({
          complaintId: payload.complaintId,
          complaintNumber: payload.complaintNumber,
          orderId: payload.orderId,
          createdById: payload.createdById,
        });
        await notificationService.sendToUsers(
          targets,
          {
            title: copy.title,
            message: copy.message,
            senderId: payload.createdById,
            notificationType: "COMPLAINT_CREATED",
            module: "complaints",
            metadata: withActionMeta(copy.actionPath, {
              complaintId: payload.complaintId,
              complaintNumber: payload.complaintNumber,
              orderId: payload.orderId,
              branchId: payload.branchId,
            }),
          },
          { senderUserId: payload.createdById },
        );
      } catch (err) {
        logger.error({ err }, "COMPLAINT_CREATED notification listener failed");
      }
    })();
  });

  appEvents.on("COMPLAINT_STATUS_CHANGED", (payload: ComplaintStatusChangedPayload) => {
    void (async () => {
      try {
        if (payload.previousStatus === payload.nextStatus) return;
        const targets = await complaintNotificationTargets(
          payload.complaintId,
          payload.orderId,
          payload.branchId,
          null,
        );
        if (targets.length === 0) return;
        const copy = await copyComplaintStatusChanged({
          complaintId: payload.complaintId,
          complaintNumber: payload.complaintNumber,
          previousStatus: payload.previousStatus,
          nextStatus: payload.nextStatus,
          changedById: payload.changedById,
        });
        await notificationService.sendToUsers(
          targets,
          {
            title: copy.title,
            message: copy.message,
            senderId: payload.changedById ?? null,
            notificationType: "COMPLAINT_STATUS_CHANGED",
            module: "complaints",
            metadata: withActionMeta(copy.actionPath, {
              complaintId: payload.complaintId,
              complaintNumber: payload.complaintNumber,
              orderId: payload.orderId,
              branchId: payload.branchId,
              previousStatus: payload.previousStatus,
              nextStatus: payload.nextStatus,
            }),
          },
          { senderUserId: payload.changedById },
        );
      } catch (err) {
        logger.error({ err }, "COMPLAINT_STATUS_CHANGED notification listener failed");
      }
    })();
  });

  appEvents.on("COMPLAINT_COMMENT_ADDED", (payload: ComplaintCommentAddedPayload) => {
    void (async () => {
      try {
        const targets = await complaintNotificationTargets(
          payload.complaintId,
          payload.orderId,
          payload.branchId,
          null,
        );
        const filtered = targets.filter((id) => id !== payload.authorId);
        if (filtered.length === 0) return;
        const copy = await copyComplaintCommentAdded({
          complaintId: payload.complaintId,
          complaintNumber: payload.complaintNumber,
          authorId: payload.authorId,
        });
        await notificationService.sendToUsers(
          filtered,
          {
            title: copy.title,
            message: copy.message,
            senderId: payload.authorId,
            notificationType: "COMPLAINT_COMMENT_ADDED",
            module: "complaints",
            metadata: withActionMeta(copy.actionPath, {
              complaintId: payload.complaintId,
              complaintNumber: payload.complaintNumber,
              orderId: payload.orderId,
              commentId: payload.commentId,
              branchId: payload.branchId,
            }),
          },
          { senderUserId: payload.authorId },
        );
      } catch (err) {
        logger.error({ err }, "COMPLAINT_COMMENT_ADDED notification listener failed");
      }
    })();
  });

  appEvents.on("PURCHASE_ORDER_CREATED", (payload: PurchaseOrderCreatedPayload) => {
    void (async () => {
      try {
        const poRef = {
          supplierId: payload.supplierId,
          manufacturerId: payload.manufacturerId,
          type: payload.type,
        };
        const partnerTargets = await purchaseOrderPartnerTargets(poRef);
        const staffTargets = await purchaseOrderStaffTargets(payload.branchId);
        const targets = [...new Set([...partnerTargets, ...staffTargets])];
        if (targets.length === 0) return;

        const copy = await copyPurchaseOrderCreated({
          purchaseOrderId: payload.purchaseOrderId,
          poNumber: payload.poNumber,
          type: payload.type,
          createdById: payload.createdById,
        });
        await notificationService.sendToUsers(
          targets,
          {
            title: copy.title,
            message: copy.message,
            senderId: payload.createdById ?? null,
            notificationType: "PURCHASE_ORDER_CREATED",
            module: "purchaseOrders",
            metadata: withActionMeta(copy.actionPath, {
              purchaseOrderId: payload.purchaseOrderId,
              poNumber: payload.poNumber,
              branchId: payload.branchId,
              supplierId: payload.supplierId,
              manufacturerId: payload.manufacturerId,
              type: payload.type,
            }),
          },
          { senderUserId: payload.createdById },
        );
      } catch (err) {
        logger.error({ err }, "PURCHASE_ORDER_CREATED notification listener failed");
      }
    })();
  });

  appEvents.on("PURCHASE_ORDER_UPDATED", (payload: PurchaseOrderUpdatedPayload) => {
    void (async () => {
      try {
        const poRef = {
          supplierId: payload.supplierId,
          manufacturerId: payload.manufacturerId,
          type: payload.type,
        };
        const targets = await purchaseOrderPartnerTargets(poRef);
        if (targets.length === 0) return;

        const copy = await copyPurchaseOrderUpdated({
          purchaseOrderId: payload.purchaseOrderId,
          poNumber: payload.poNumber,
          type: payload.type,
          updatedById: payload.updatedById,
        });
        await notificationService.sendToUsers(
          targets,
          {
            title: copy.title,
            message: copy.message,
            senderId: payload.updatedById ?? null,
            notificationType: "PURCHASE_ORDER_UPDATED",
            module: "purchaseOrders",
            metadata: withActionMeta(copy.actionPath, {
              purchaseOrderId: payload.purchaseOrderId,
              poNumber: payload.poNumber,
              branchId: payload.branchId,
              supplierId: payload.supplierId,
              manufacturerId: payload.manufacturerId,
              type: payload.type,
            }),
          },
          { senderUserId: payload.updatedById },
        );
      } catch (err) {
        logger.error({ err }, "PURCHASE_ORDER_UPDATED notification listener failed");
      }
    })();
  });

  appEvents.on("PURCHASE_ORDER_STATUS_CHANGED", (payload: PurchaseOrderStatusChangedPayload) => {
    void (async () => {
      try {
        if (payload.previousStatus === payload.nextStatus) return;

        const poRef = {
          supplierId: payload.supplierId,
          manufacturerId: payload.manufacturerId,
          type: payload.type,
        };

        const targets = payload.changedByPartner
          ? (await purchaseOrderStaffTargets(payload.branchId)).filter(
              (id) => id !== payload.changedById,
            )
          : await purchaseOrderPartnerTargets(poRef);

        if (targets.length === 0) return;

        const copy = await copyPurchaseOrderStatusChanged({
          purchaseOrderId: payload.purchaseOrderId,
          poNumber: payload.poNumber,
          type: payload.type,
          previousStatus: payload.previousStatus,
          nextStatus: payload.nextStatus,
          changedByPartner: payload.changedByPartner,
          changedById: payload.changedById,
        });

        await notificationService.sendToUsers(
          targets,
          {
            title: copy.title,
            message: copy.message,
            senderId: payload.changedById ?? null,
            notificationType: "PURCHASE_ORDER_STATUS_CHANGED",
            module: "purchaseOrders",
            metadata: withActionMeta(copy.actionPath, {
              purchaseOrderId: payload.purchaseOrderId,
              poNumber: payload.poNumber,
              branchId: payload.branchId,
              supplierId: payload.supplierId,
              manufacturerId: payload.manufacturerId,
              type: payload.type,
              previousStatus: payload.previousStatus,
              nextStatus: payload.nextStatus,
              changedByPartner: payload.changedByPartner,
            }),
          },
          { senderUserId: payload.changedById },
        );
      } catch (err) {
        logger.error({ err }, "PURCHASE_ORDER_STATUS_CHANGED notification listener failed");
      }
    })();
  });
}
