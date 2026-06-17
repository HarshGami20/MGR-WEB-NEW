import { formatInr } from "./format-currency";
import { humanizeToken } from "./notification-copy";
import {
  orderNotificationWhatsAppDetail,
  type OrderNotificationSummary,
} from "./order-notification-summary";

function formatAmountText(amount: string): string {
  const n = Number(amount);
  return Number.isFinite(n) ? formatInr(n) : `₹${amount}`;
}

export type WhatsAppTemplateParameter =
  | {
      type: "text";
      text: string;
      parameter_name?: string;
    }
  | {
      type: "otp";
      otp_type: "COPY_CODE";
      text: string;
    };

export type WhatsAppTemplateComponent = {
  type: "body" | "button";
  sub_type?: "url" | "copy_code";
  index?: string | number;
  parameters: WhatsAppTemplateParameter[];
};

export type WhatsAppTemplateMessage = {
  name: string;
  language: { code: string };
  components: WhatsAppTemplateComponent[];
};

function bodyParam(name: string, text: string) {
  return { parameter_name: name, type: "text" as const, text: text.slice(0, 1024) };
}

function orderButton(orderId: number): WhatsAppTemplateComponent {
  return {
    type: "button",
    sub_type: "url",
    index: "0",
    parameters: [{ type: "text", text: String(orderId) }],
  };
}

function humanizePaymentStatus(status: string): string {
  return humanizeToken(status);
}

function humanizeDeliveryStatus(status: string): string {
  if (status === "out_for_delivery") return "Out for delivery";
  return humanizeToken(status);
}

/** Order created */
export function templateOrderCreated(input: {
  recipientName: string;
  createdByName: string;
  orderId: number;
  branchName: string;
  orderSummary: OrderNotificationSummary;
}): WhatsAppTemplateMessage {
  return {
    name: process.env["WHATSAPP_TEMPLATE_ORDER_CREATED"]?.trim() || "mgr_carsa_order_managment",
    language: { code: process.env["WHATSAPP_TEMPLATE_ORDER_CREATED_LANG"]?.trim() || "en_US" },
    components: [
      {
        type: "body",
        parameters: [
          bodyParam("recipient_name", input.recipientName),
          bodyParam("created_by_name", input.createdByName),
          bodyParam("branch_name", input.branchName),
          bodyParam("order_id", orderNotificationWhatsAppDetail(input.orderSummary)),
        ],
      },
      orderButton(input.orderId),
    ],
  };
}

/** Order status changed */
export function templateOrderStatusChanged(input: {
  recipientName: string;
  changedByName: string;
  orderId: number;
  branchName: string;
  nextStatus: string;
  orderSummary: OrderNotificationSummary;
}): WhatsAppTemplateMessage {
  return {
    name: process.env["WHATSAPP_TEMPLATE_ORDER_STATUS"]?.trim() || "mgr_job_status_guj",
    language: { code: process.env["WHATSAPP_TEMPLATE_ORDER_STATUS_LANG"]?.trim() || "en" },
    components: [
      {
        type: "body",
        parameters: [
          bodyParam("recipient_name", input.recipientName),
          bodyParam("branch_name", input.branchName),
          bodyParam("order_id", orderNotificationWhatsAppDetail(input.orderSummary)),
          bodyParam("job_status", humanizeToken(input.nextStatus)),
          bodyParam("changed_by_name", input.changedByName),
        ],
      },
      orderButton(input.orderId),
    ],
  };
}

/** Order updated (non-status fields) */
export function templateOrderUpdated(input: {
  recipientName: string;
  updatedByName: string;
  orderId: number;
  branchName: string;
  orderSummary: OrderNotificationSummary;
}): WhatsAppTemplateMessage {
  return {
    name: process.env["WHATSAPP_TEMPLATE_ORDER_UPDATED"]?.trim() || "mgr_order_updated_guj",
    language: { code: process.env["WHATSAPP_TEMPLATE_ORDER_UPDATED_LANG"]?.trim() || "en" },
    components: [
      {
        type: "body",
        parameters: [
          bodyParam("recipient_name", input.recipientName),
          bodyParam("branch_name", input.branchName),
          bodyParam("order_id", orderNotificationWhatsAppDetail(input.orderSummary)),
          bodyParam("updated_by_name", input.updatedByName),
        ],
      },
      orderButton(input.orderId),
    ],
  };
}

function paymentStatusTemplateName(): string {
  return process.env["WHATSAPP_TEMPLATE_PAYMENT_RECEIVED"]?.trim() || "mgr_payment_status_guj";
}

function paymentStatusTemplateLanguage(): string {
  return process.env["WHATSAPP_TEMPLATE_PAYMENT_RECEIVED_LANG"]?.trim() || "en";
}

function templatePaymentStatusMessage(input: {
  recipientName: string;
  actorName: string;
  orderId: number;
  branchName: string;
  paymentStatus: string;
  orderSummary: OrderNotificationSummary;
}): WhatsAppTemplateMessage {
  return {
    name: paymentStatusTemplateName(),
    language: { code: paymentStatusTemplateLanguage() },
    components: [
      {
        type: "body",
        parameters: [
          bodyParam("recipient_name", input.recipientName),
          bodyParam("branch_name", input.branchName),
          bodyParam("order_id", orderNotificationWhatsAppDetail(input.orderSummary)),
          bodyParam("payment_status", humanizePaymentStatus(input.paymentStatus)),
          bodyParam("recorded_by_name", input.actorName),
        ],
      },
      orderButton(input.orderId),
    ],
  };
}

/** Payment recorded on order */
export function templatePaymentReceived(input: {
  recipientName: string;
  recordedByName: string;
  orderId: number;
  branchName: string;
  paymentStatus: string;
  orderSummary: OrderNotificationSummary;
}): WhatsAppTemplateMessage {
  return templatePaymentStatusMessage({
    recipientName: input.recipientName,
    actorName: input.recordedByName,
    orderId: input.orderId,
    branchName: input.branchName,
    paymentStatus: input.paymentStatus,
    orderSummary: input.orderSummary,
  });
}

/** Order payment status changed (dropdown / order edit — no new payment row) */
export function templatePaymentStatusChanged(input: {
  recipientName: string;
  changedByName: string;
  orderId: number;
  branchName: string;
  previousPaymentStatus: string;
  nextPaymentStatus: string;
  orderSummary: OrderNotificationSummary;
}): WhatsAppTemplateMessage {
  return {
    name:
      process.env["WHATSAPP_TEMPLATE_ORDER_PAYMENT_STATUS_CHANGED"]?.trim() ||
      "mgr_order_payment_status_guj",
    language: {
      code:
        process.env["WHATSAPP_TEMPLATE_ORDER_PAYMENT_STATUS_CHANGED_LANG"]?.trim() || "gu",
    },
    components: [
      {
        type: "body",
        parameters: [
          bodyParam("recipient_name", input.recipientName),
          bodyParam("order_id", orderNotificationWhatsAppDetail(input.orderSummary)),
          bodyParam("branch_name", input.branchName),
          bodyParam("previous_status", humanizePaymentStatus(input.previousPaymentStatus)),
          bodyParam("new_status", humanizePaymentStatus(input.nextPaymentStatus)),
          bodyParam("changed_by_name", input.changedByName),
        ],
      },
      orderButton(input.orderId),
    ],
  };
}

/** Delivery status updated */
export function templateDeliveryUpdated(input: {
  recipientName: string;
  changedByName: string;
  orderId: number;
  branchName: string;
  deliveryStatus: string;
  driverName: string;
  orderSummary: OrderNotificationSummary;
}): WhatsAppTemplateMessage {
  return {
    name: process.env["WHATSAPP_TEMPLATE_DELIVERY_UPDATED"]?.trim() || "mgr_delivery_status_en",
    language: { code: process.env["WHATSAPP_TEMPLATE_DELIVERY_UPDATED_LANG"]?.trim() || "en" },
    components: [
      {
        type: "body",
        parameters: [
          bodyParam("recipient_name", input.recipientName),
          bodyParam("branch_name", input.branchName),
          bodyParam("order_id", orderNotificationWhatsAppDetail(input.orderSummary)),
          bodyParam("delivery_status", humanizeDeliveryStatus(input.deliveryStatus)),
          bodyParam("driver_name", input.driverName),
          bodyParam("changed_by_name", input.changedByName),
        ],
      },
      orderButton(input.orderId),
    ],
  };
}

/** New staff comment on order */
export function templateOrderCommentAdded(input: {
  recipientName: string;
  commentByName: string;
  orderId: number;
  branchName: string;
  commentPreview: string;
  orderSummary: OrderNotificationSummary;
}): WhatsAppTemplateMessage {
  return {
    name: process.env["WHATSAPP_TEMPLATE_ORDER_COMMENT"]?.trim() || "mgr_order_comment_en",
    language: { code: process.env["WHATSAPP_TEMPLATE_ORDER_COMMENT_LANG"]?.trim() || "en" },
    components: [
      {
        type: "body",
        parameters: [
          bodyParam("recipient_name", input.recipientName),
          bodyParam("branch_name", input.branchName),
          bodyParam("order_id", orderNotificationWhatsAppDetail(input.orderSummary)),
          bodyParam("comment_by_name", input.commentByName),
          bodyParam("comment_preview", input.commentPreview),
        ],
      },
      orderButton(input.orderId),
    ],
  };
}

function poButton(purchaseOrderId: number): WhatsAppTemplateComponent {
  return {
    type: "button",
    sub_type: "url",
    index: "0",
    parameters: [{ type: "text", text: String(purchaseOrderId) }],
  };
}

function poPartnerTypeLabel(type: string): string {
  return type === "manufacturer" ? "Manufacturer" : "Supplier";
}

/** Purchase order created */
export function templatePurchaseOrderCreated(input: {
  recipientName: string;
  createdByName: string;
  purchaseOrderId: number;
  poNumber: string;
  branchName: string;
  partnerName: string;
  partnerType: string;
  totalAmount: string;
}): WhatsAppTemplateMessage {
  const detail = `${input.poNumber} | ${poPartnerTypeLabel(input.partnerType)}: ${input.partnerName} | ${formatAmountText(input.totalAmount)}`;
  return {
    name: process.env["WHATSAPP_TEMPLATE_PO_CREATED"]?.trim() || "mgr_po_created_guj",
    language: { code: process.env["WHATSAPP_TEMPLATE_PO_CREATED_LANG"]?.trim() || "gu" },
    components: [
      {
        type: "body",
        parameters: [
          bodyParam("recipient_name", input.recipientName),
          bodyParam("created_by_name", input.createdByName),
          bodyParam("branch_name", input.branchName),
          bodyParam("partner_name", input.partnerName),
          bodyParam("po_id", detail),
        ],
      },
      poButton(input.purchaseOrderId),
    ],
  };
}

/** Purchase order updated */
export function templatePurchaseOrderUpdated(input: {
  recipientName: string;
  updatedByName: string;
  purchaseOrderId: number;
  poNumber: string;
  branchName: string;
  partnerName: string;
}): WhatsAppTemplateMessage {
  const detail = `${input.poNumber} | ${input.partnerName}`;
  return {
    name: process.env["WHATSAPP_TEMPLATE_PO_UPDATED"]?.trim() || "mgr_po_updated_guj",
    language: { code: process.env["WHATSAPP_TEMPLATE_PO_UPDATED_LANG"]?.trim() || "gu" },
    components: [
      {
        type: "body",
        parameters: [
          bodyParam("recipient_name", input.recipientName),
          bodyParam("updated_by_name", input.updatedByName),
          bodyParam("branch_name", input.branchName),
          bodyParam("partner_name", input.partnerName),
          bodyParam("po_id", detail),
        ],
      },
      poButton(input.purchaseOrderId),
    ],
  };
}

/** Purchase order status changed */
export function templatePurchaseOrderStatusChanged(input: {
  recipientName: string;
  changedByName: string;
  purchaseOrderId: number;
  poNumber: string;
  branchName: string;
  partnerName: string;
  nextStatus: string;
}): WhatsAppTemplateMessage {
  return {
    name: process.env["WHATSAPP_TEMPLATE_PO_STATUS"]?.trim() || "mgr_po_status_guj",
    language: { code: process.env["WHATSAPP_TEMPLATE_PO_STATUS_LANG"]?.trim() || "gu" },
    components: [
      {
        type: "body",
        parameters: [
          bodyParam("recipient_name", input.recipientName),
          bodyParam("branch_name", input.branchName),
          bodyParam("po_id", `${input.poNumber} (#${input.purchaseOrderId})`),
          bodyParam("po_status", humanizeToken(input.nextStatus)),
          bodyParam("partner_name", input.partnerName),
          bodyParam("changed_by_name", input.changedByName),
        ],
      },
      poButton(input.purchaseOrderId),
    ],
  };
}

function humanizeAdjustmentType(type: string): string {
  if (type === "in") return "Stock In";
  if (type === "out") return "Stock Out";
  return "Stock Adjustment";
}

/**
 * Web login OTP — Meta **Authentication** template (Copy code button).
 * When sending, Meta expects body + button with the same OTP as `type: "text"`;
 * button uses `sub_type: "url"` (not `copy_code`) even though the template shows Copy code.
 * @see https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates/
 */
export function templateLoginOtp(input: { otpCode: string }): WhatsAppTemplateMessage {
  const otp = input.otpCode.replace(/\D/g, "").slice(0, 15);
  return {
    name: process.env["WHATSAPP_TEMPLATE_LOGIN_OTP"]?.trim() || "mgr_casa_login_otp",
    language: { code: process.env["WHATSAPP_TEMPLATE_LOGIN_OTP_LANG"]?.trim() || "en" },
    components: [
      {
        type: "body",
        parameters: [{ type: "text", text: otp }],
      },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: otp }],
      },
    ],
  };
}

/** Inventory / stock updated (body only — Meta template URL button is static, no dynamic suffix). */
export function templateInventoryUpdated(input: {
  recipientName: string;
  updatedByName: string;
  branchName: string;
  inventoryDetail: string;
  adjustmentType: string;
  newStockQty: string;
  notesPreview: string;
}): WhatsAppTemplateMessage {
  return {
    name: process.env["WHATSAPP_TEMPLATE_INVENTORY_UPDATED"]?.trim() || "mgr_inventory_updated_guj",
    language: { code: process.env["WHATSAPP_TEMPLATE_INVENTORY_UPDATED_LANG"]?.trim() || "gu" },
    components: [
      {
        type: "body",
        parameters: [
          bodyParam("recipient_name", input.recipientName),
          bodyParam("updated_by_name", input.updatedByName),
          bodyParam("branch_name", input.branchName),
          bodyParam("inventory_detail", input.inventoryDetail),
          bodyParam("adjustment_type", humanizeAdjustmentType(input.adjustmentType)),
          bodyParam("new_stock_qty", input.newStockQty),
          bodyParam("notes_preview", input.notesPreview),
        ],
      },
    ],
  };
}
