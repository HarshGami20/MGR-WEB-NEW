import {
  appEvents,
  type OrderCreatedPayload,
  type OrderDeliveryUpdatedPayload,
  type OrderStaffCommentAddedPayload,
  type OrderStatusChangedPayload,
  type OrderUpdatedPayload,
  type PaymentReceivedPayload,
} from "../lib/app-events";
import { actorName } from "../lib/notification-copy";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import {
  orderAssigneeRecipients,
  type OrderAssigneeRecipient,
} from "../lib/whatsapp-order-recipients";
import {
  templateDeliveryUpdated,
  templateOrderCommentAdded,
  templateOrderCreated,
  templateOrderStatusChanged,
  templateOrderUpdated,
  templatePaymentReceived,
  type WhatsAppTemplateMessage,
} from "../lib/whatsapp-templates";
import { sendWhatsAppTemplate } from "../services/whatsapp-service";

const waEvLog = logger.child({ ns: "whatsapp", layer: "events" });

function devModeTestPhone(): string | null {
  const raw = process.env["WHATSAPP_DEV_PHONE"]?.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 10) return digits;
  return null;
}

function isDevMode(): boolean {
  const v = process.env["DEV_MODE"]?.trim().toLowerCase();
  return v === "true" || v === "1";
}

async function loadOrderWhatsAppContext(orderId: number) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      status: true,
      totalAmount: true,
      paymentStatus: true,
      deliveryStatus: true,
      branch: { select: { name: true } },
      driver: { select: { name: true } },
    },
  });
}

function branchLabel(order: { branch: { name: string } | null }): string {
  const name = order.branch?.name?.trim();
  return name || "—";
}

function driverLabel(order: { driver: { name: string } | null }): string {
  const name = order.driver?.name?.trim();
  return name || "—";
}

/** One personalized template per assignee (recipient_name in each message). */
async function sendWhatsAppToAssignees(
  orderId: number,
  buildTemplate: (recipient: OrderAssigneeRecipient) => WhatsAppTemplateMessage,
): Promise<void> {
  const recipients = await orderAssigneeRecipients(orderId);
  if (recipients.length === 0) {
    waEvLog.debug({ orderId }, "WhatsApp: no assignee recipients with valid phones");
    return;
  }

  const testPhone = isDevMode() ? devModeTestPhone() : null;

  await Promise.all(
    recipients.map(async (recipient) => {
      const to = testPhone ?? recipient.phone;
      const template = buildTemplate(recipient);
      await sendWhatsAppTemplate(to, template);
    }),
  );
}

export function registerWhatsAppEventListeners(): void {
  appEvents.on("ORDER_CREATED", (payload: OrderCreatedPayload) => {
    void (async () => {
      try {
        const order = await loadOrderWhatsAppContext(payload.orderId);
        if (!order) return;

        const createdBy = (await actorName(payload.createdById)) ?? "Staff";
        const total = String(order.totalAmount ?? "0");

        await sendWhatsAppToAssignees(payload.orderId, (recipient) =>
          templateOrderCreated({
            recipientName: recipient.name,
            createdByName: createdBy,
            orderId: order.id,
            orderNumber: order.orderNumber,
            branchName: branchLabel(order),
            customerName: order.customerName,
            totalAmount: total,
          }),
        );
      } catch (err) {
        logger.error({ err }, "ORDER_CREATED WhatsApp listener failed");
      }
    })();
  });

  appEvents.on("ORDER_STATUS_CHANGED", (payload: OrderStatusChangedPayload) => {
    void (async () => {
      try {
        if (payload.previousStatus === payload.nextStatus) return;

        const order = await loadOrderWhatsAppContext(payload.orderId);
        if (!order) return;

        const changedBy = (await actorName(payload.changedById)) ?? "Staff";

        await sendWhatsAppToAssignees(payload.orderId, (recipient) =>
          templateOrderStatusChanged({
            recipientName: recipient.name,
            changedByName: changedBy,
            orderId: order.id,
            orderNumber: order.orderNumber,
            branchName: branchLabel(order),
            nextStatus: payload.nextStatus,
          }),
        );
      } catch (err) {
        logger.error({ err }, "ORDER_STATUS_CHANGED WhatsApp listener failed");
      }
    })();
  });

  appEvents.on("ORDER_UPDATED", (payload: OrderUpdatedPayload) => {
    void (async () => {
      try {
        const order = await loadOrderWhatsAppContext(payload.orderId);
        if (!order) return;

        const updatedBy = (await actorName(payload.updatedById)) ?? "Staff";

        await sendWhatsAppToAssignees(payload.orderId, (recipient) =>
          templateOrderUpdated({
            recipientName: recipient.name,
            updatedByName: updatedBy,
            orderId: order.id,
            orderNumber: order.orderNumber,
            branchName: branchLabel(order),
            customerName: order.customerName,
          }),
        );
      } catch (err) {
        logger.error({ err }, "ORDER_UPDATED WhatsApp listener failed");
      }
    })();
  });

  appEvents.on("PAYMENT_RECEIVED", (payload: PaymentReceivedPayload) => {
    void (async () => {
      try {
        const order = await loadOrderWhatsAppContext(payload.orderId);
        if (!order) return;

        const recordedBy = (await actorName(payload.recordedById)) ?? "Staff";
        const paymentStatus = String(order.paymentStatus ?? "due");

        await sendWhatsAppToAssignees(payload.orderId, (recipient) =>
          templatePaymentReceived({
            recipientName: recipient.name,
            recordedByName: recordedBy,
            orderId: order.id,
            orderNumber: order.orderNumber,
            branchName: branchLabel(order),
            paymentStatus,
            amount: payload.amount,
          }),
        );
      } catch (err) {
        logger.error({ err }, "PAYMENT_RECEIVED WhatsApp listener failed");
      }
    })();
  });

  appEvents.on("ORDER_DELIVERY_UPDATED", (payload: OrderDeliveryUpdatedPayload) => {
    void (async () => {
      try {
        if (payload.previousDeliveryStatus === payload.nextDeliveryStatus) return;

        const order = await loadOrderWhatsAppContext(payload.orderId);
        if (!order) return;

        const changedBy = (await actorName(payload.changedById)) ?? "Staff";

        await sendWhatsAppToAssignees(payload.orderId, (recipient) =>
          templateDeliveryUpdated({
            recipientName: recipient.name,
            changedByName: changedBy,
            orderId: order.id,
            orderNumber: order.orderNumber,
            branchName: branchLabel(order),
            deliveryStatus: payload.nextDeliveryStatus,
            driverName: driverLabel(order),
          }),
        );
      } catch (err) {
        logger.error({ err }, "ORDER_DELIVERY_UPDATED WhatsApp listener failed");
      }
    })();
  });

  appEvents.on("ORDER_STAFF_COMMENT_ADDED", (payload: OrderStaffCommentAddedPayload) => {
    void (async () => {
      try {
        const order = await loadOrderWhatsAppContext(payload.orderId);
        if (!order) return;

        let commentBy = payload.commentByName?.trim() || "";
        if (!commentBy || commentBy === "Staff") {
          commentBy = (await actorName(payload.addedById)) ?? "Staff";
        }

        await sendWhatsAppToAssignees(payload.orderId, (recipient) =>
          templateOrderCommentAdded({
            recipientName: recipient.name,
            commentByName: commentBy,
            orderId: order.id,
            orderNumber: order.orderNumber,
            branchName: branchLabel(order),
            commentPreview: payload.commentPreview,
          }),
        );
      } catch (err) {
        logger.error({ err }, "ORDER_STAFF_COMMENT_ADDED WhatsApp listener failed");
      }
    })();
  });
}
