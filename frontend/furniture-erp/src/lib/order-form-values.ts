import { sanitizeLettersOnly, FIELD_LIMITS } from "@/lib/form-validation";
import { apiItemToFormValues } from "@/lib/line-item-form-schema";
import { defaultCatalogLineItem } from "@/lib/custom-line-item";

/** Normalize API boolean (handles rare string/number shapes from JSON). */
export function parseApiBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "true" || value === "1";
}

export type OrderFormSource = {
  id?: number;
  customerName?: string | null;
  customerMobile?: string | null;
  customerAddress?: string | null;
  deliverySlotId?: number | null;
  googlePlaceId?: string | null;
  addressLat?: number | string | null;
  addressLng?: number | string | null;
  isGst?: unknown;
  customerGstNumber?: string | null;
  items?: unknown[];
  status?: string | null;
  paymentStatus?: string | null;
  advanceAmount?: number | string | null;
  paidAmount?: number | string | null;
  paymentMode?: string | null;
  assignees?: Array<{ id: number }>;
  assignedToId?: number | null;
  deliveryAssignees?: Array<{ id: number }>;
  deliveryDate?: string | null;
  deliveryCharge?: number | string | null;
  driver?: { id: number } | null;
  driverId?: number | null;
  challanImages?: string[];
  photoComments?: Array<{ imageUrl?: string; comment?: string }>;
  staffComments?: Array<{ comment?: string }>;
  deliveryComments?: Array<{ comment?: string }>;
};

/** Map GET /orders/:id payload → react-hook-form values for edit mode. */
export function buildOrderFormValues(order: OrderFormSource) {
  const existingStaffComments = Array.isArray(order.staffComments) ? order.staffComments : [];
  const existingDeliveryComments = Array.isArray(order.deliveryComments) ? order.deliveryComments : [];
  const isGst = parseApiBoolean(order.isGst);

  return {
    customerName: sanitizeLettersOnly(order.customerName ?? "", FIELD_LIMITS.customerName),
    customerMobile: order.customerMobile ?? "",
    customerAddress: order.customerAddress ?? "",
    deliverySlotId: order.deliverySlotId ?? null,
    googlePlaceId: order.googlePlaceId ?? "",
    addressLat: order.addressLat != null ? Number(order.addressLat) : null,
    addressLng: order.addressLng != null ? Number(order.addressLng) : null,
    isGst,
    customerGstNumber: order.customerGstNumber ?? "",
    items:
      Array.isArray(order.items) && order.items.length > 0
        ? order.items.map((item) => apiItemToFormValues(item as Parameters<typeof apiItemToFormValues>[0], { priceIncludesGst: isGst }))
        : [{ ...defaultCatalogLineItem }],
    status: order.status === "delivered" ? "complete" : (order.status ?? "order_received"),
    paymentStatus: order.paymentStatus ?? "due",
    advanceAmount: Number(order.advanceAmount ?? order.paidAmount ?? 0),
    paymentMode: order.paymentMode ?? "cash",
    assigneeUserIds: Array.isArray(order.assignees)
      ? order.assignees.map((a) => a.id).filter((x) => Number.isFinite(x))
      : order.assignedToId != null
        ? [Number(order.assignedToId)]
        : [],
    deliveryAssigneeUserIds: Array.isArray(order.deliveryAssignees)
      ? order.deliveryAssignees.map((a) => a.id).filter((x) => Number.isFinite(x))
      : [],
    deliveryDate: order.deliveryDate ? String(order.deliveryDate).slice(0, 10) : null,
    deliveryCharge: Number(order.deliveryCharge ?? 0),
    driverId: order.driver?.id ?? order.driverId ?? null,
    challanImages:
      Array.isArray(order.challanImages) && order.challanImages.length > 0
        ? [{ imageUrl: String(order.challanImages[0] || "") }]
        : [{ imageUrl: "" }],
    photoComments:
      Array.isArray(order.photoComments) && order.photoComments.length > 0
        ? order.photoComments
        : [{ imageUrl: "", comment: "" }],
    staffCommentsText: existingStaffComments
      .map((entry) => entry?.comment)
      .filter(Boolean)
      .join("\n"),
    deliveryCommentsText: existingDeliveryComments
      .map((entry) => entry?.comment)
      .filter(Boolean)
      .join("\n"),
  };
}
