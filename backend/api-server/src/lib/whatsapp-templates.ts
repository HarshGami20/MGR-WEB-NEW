import { humanizeToken } from "./notification-copy";

export type WhatsAppTemplateComponent = {
  type: "body" | "button";
  sub_type?: "url";
  index?: string | number;
  parameters: Array<{
    type: "text";
    text: string;
    parameter_name?: string;
  }>;
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
  orderNumber: string;
  branchName: string;
  customerName: string;
  totalAmount: string;
}): WhatsAppTemplateMessage {
  const detail = `${input.orderNumber} | ${input.customerName} | ₹${input.totalAmount}`;
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
          bodyParam("order_id", detail),
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
  orderNumber: string;
  branchName: string;
  nextStatus: string;
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
          bodyParam("order_id", `${input.orderNumber} (#${input.orderId})`),
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
  orderNumber: string;
  branchName: string;
  customerName: string;
}): WhatsAppTemplateMessage {
  const detail = `${input.orderNumber} | ${input.customerName}`;
  return {
    name: process.env["WHATSAPP_TEMPLATE_ORDER_UPDATED"]?.trim() || "mgr_order_updated_guj",
    language: { code: process.env["WHATSAPP_TEMPLATE_ORDER_UPDATED_LANG"]?.trim() || "en" },
    components: [
      {
        type: "body",
        parameters: [
          bodyParam("recipient_name", input.recipientName),
          bodyParam("branch_name", input.branchName),
          bodyParam("order_id", detail),
          bodyParam("updated_by_name", input.updatedByName),
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
  orderNumber: string;
  branchName: string;
  paymentStatus: string;
  amount: string;
}): WhatsAppTemplateMessage {
  const detail = `${input.orderNumber} | ₹${input.amount} received`;
  return {
    name: process.env["WHATSAPP_TEMPLATE_PAYMENT_RECEIVED"]?.trim() || "mgr_payment_status_guj",
    language: { code: process.env["WHATSAPP_TEMPLATE_PAYMENT_RECEIVED_LANG"]?.trim() || "en" },
    components: [
      {
        type: "body",
        parameters: [
          bodyParam("recipient_name", input.recipientName),
          bodyParam("branch_name", input.branchName),
          bodyParam("order_id", detail),
          bodyParam("payment_status", humanizePaymentStatus(input.paymentStatus)),
          bodyParam("recorded_by_name", input.recordedByName),
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
  orderNumber: string;
  branchName: string;
  deliveryStatus: string;
  driverName: string;
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
          bodyParam("order_id", `${input.orderNumber} (#${input.orderId})`),
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
  orderNumber: string;
  branchName: string;
  commentPreview: string;
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
          bodyParam("order_id", `${input.orderNumber} (#${input.orderId})`),
          bodyParam("comment_by_name", input.commentByName),
          bodyParam("comment_preview", input.commentPreview),
        ],
      },
      orderButton(input.orderId),
    ],
  };
}
