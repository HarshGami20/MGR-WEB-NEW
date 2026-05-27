import { randomBytes } from "node:crypto";
import { Router, IRouter } from "express";
import { z } from "zod";
import { CreateOrderBody, UpdateOrderBody, UpdateOrderStatusBody, GetOrderParams } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission, requirePermissionAny } from "../lib/permissions";
import {
  pickBestDeliverySlot,
  normalizeMainOrderStatus,
  normalizeDeliveryStatus,
  countOrdersInSlot,
  slotServesPincode,
  parseDeliveryDateInput,
  utcDateOnly,
  sameUtcDate,
} from "../lib/delivery-slots";
import type { Prisma } from "@prisma/client";
import { prisma, toNumber } from "../lib/prisma";
import { emitSafe } from "../lib/app-events";
import { assigneeIdsKey, orderHasNonWorkflowFieldChanges } from "../lib/order-update-detect";
import {
  findNewStaffComments,
  parseStaffCommentsJson,
} from "../lib/order-staff-comments";
import { requireWriteBranchId, resolveLogBranchId } from "../lib/branch-scope";
import { assignedBranchIds } from "../lib/user-branches";
import { orderHasProductInCategories, resolveCategoryFilterIds } from "../lib/category-filter";
import { collectOrderUploadUrls } from "../lib/collect-order-upload-urls";
import { deleteUploadFilesByUrl } from "../lib/delete-upload-files";
import {
  assertOrderAccessibleBySalesScope,
  assignmentScopeWhere,
  resolveOrdersAssignmentScope,
} from "../lib/sales-order-scope";
import { decrementProductStock, incrementProductStock } from "../lib/product-stock";
import {
  isCustomLineItem,
  buildCustomAttributesJson,
  resolveCustomLineImages,
  normalizeLineDescription,
  type IncomingLineItem,
} from "../lib/custom-line-item";
import { breakdownGstExclusiveLine, breakdownGstInclusiveLine } from "../lib/gst-pricing";
import { parseImageUrlsJson } from "../lib/image-urls";
import { ymdUtcDayEnd, ymdUtcDayStart } from "../lib/date-range";
import { DELIVERY_SLOTS_ENABLED } from "../lib/delivery-feature";
import {
  assertCanUpdateOrderDeliveryStatus,
  loadDeliveryAssigneesForOrder,
  replaceOrderDeliveryAssignees,
} from "../lib/order-delivery-assignees";
import { parseDeliveryCharge, resolveDriverIdForOrder } from "../lib/drivers";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";

const router: IRouter = Router();
const ORDER_STATUSES = new Set([
  "order_received",
  "manufacturing",
  "ready_to_ship",
  "complete",
  "cancelled",
]);

const PatchOrderDeliveryBody = z.object({
  deliveryStatus: z.enum(["pending", "out_for_delivery", "delivered"]).optional(),
  deliverySlotId: z.union([z.number().int().positive(), z.null()]).optional(),
  driverId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
});

/** Out for delivery only when main order is ready_to_ship; Delivered only after Out for delivery. */
function assertDeliveryStatusTransition(params: {
  mainStatus: string;
  prevDelivery: string;
  nextDelivery: string;
}): { ok: true } | { ok: false; error: string } {
  const main = normalizeMainOrderStatus(params.mainStatus);
  const prev = normalizeDeliveryStatus(params.prevDelivery);
  const next = normalizeDeliveryStatus(params.nextDelivery);
  if (prev === next) return { ok: true };
  if (next === "pending") return { ok: true };
  if (next === "out_for_delivery") {
    if (main !== "ready_to_ship") {
      return {
        ok: false,
        error: "Delivery can be set to Out for delivery only when the order status is Ready to ship.",
      };
    }
    return { ok: true };
  }
  if (next === "delivered") {
    if (prev !== "out_for_delivery") {
      return {
        ok: false,
        error: "Delivery can be marked Delivered only after it is Out for delivery.",
      };
    }
    return { ok: true };
  }
  return { ok: true };
}

/** Any persisted row: out_for_delivery requires main status ready_to_ship. */
function assertOrderDeliveryCoherence(mainStatus: string, deliveryStatus: string): { ok: true } | { ok: false; error: string } {
  const main = normalizeMainOrderStatus(mainStatus);
  const del = normalizeDeliveryStatus(deliveryStatus);
  if (del === "out_for_delivery" && main !== "ready_to_ship") {
    return {
      ok: false,
      error: "Order is not Ready to ship but delivery is Out for delivery. Set delivery to Pending or move order to Ready to ship.",
    };
  }
  return { ok: true };
}

async function assertValidOrderDeliverySlot(
  tx: Prisma.TransactionClient,
  params: {
    branchId: number;
    deliverySlotId: number;
    deliveryDate: Date | null;
    pincode: string | null | undefined;
    excludeOrderId?: number;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const slot = await tx.deliverySlot.findUnique({ where: { id: params.deliverySlotId } });
  if (!slot || slot.branchId !== params.branchId) return { ok: false, error: "Delivery slot not found for this branch" };
  if (!params.deliveryDate) return { ok: false, error: "Delivery date is required when assigning a slot" };
  if (!sameUtcDate(utcDateOnly(slot.slotDate), utcDateOnly(params.deliveryDate))) {
    return { ok: false, error: "Slot date does not match delivery date" };
  }
  if (!slotServesPincode(slot.servicePincodes, params.pincode)) {
    return { ok: false, error: "Pincode is not covered by this delivery slot" };
  }
  const used = await countOrdersInSlot(tx, slot.id, params.excludeOrderId);
  if (used >= slot.maxOrders) return { ok: false, error: "This delivery slot is full" };
  return { ok: true };
}
const PAYMENT_STATUSES = new Set(["due", "partially_paid", "paid"]);

const orderImageUploadDir = path.resolve(process.cwd(), "uploads", "orders");
if (!fs.existsSync(orderImageUploadDir)) fs.mkdirSync(orderImageUploadDir, { recursive: true });

const orderImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, orderImageUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
      cb(null, `o-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image uploads are allowed"));
  },
});

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizePaymentStatus(totalAmount: number, paidAmount: number, requested?: string | null) {
  if (requested && PAYMENT_STATUSES.has(requested)) return requested;
  return derivePaymentStatusFromAmounts(totalAmount, paidAmount);
}

function derivePaymentStatusFromAmounts(
  totalAmount: number,
  paidAmount: number,
): "due" | "partially_paid" | "paid" {
  if (paidAmount <= 0) return "due";
  if (paidAmount >= totalAmount) return "paid";
  return "partially_paid";
}

const ADVANCE_PAYMENT_NOTE = "Advance payment at order creation";

async function syncAdvancePaymentOnOrderUpdate(
  tx: Prisma.TransactionClient,
  orderId: number,
  opts: {
    totalAmount: number;
    existingAdvanceAmount: number;
    nextAdvanceAmount?: number;
    paymentMode?: string | null;
    chequeNumber?: string | null;
    advanceAmountProvided: boolean;
    paymentModeProvided: boolean;
  },
): Promise<{ advanceAmount: number; paidAmount: number; paymentStatus: "due" | "partially_paid" | "paid" }> {
  const payments = await tx.payment.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
  });

  let advancePayment = payments.find((p) => p.notes === ADVANCE_PAYMENT_NOTE) ?? null;
  if (!advancePayment && opts.existingAdvanceAmount > 0) {
    advancePayment =
      payments.find((p) => Math.abs(toNumber(p.amount) - opts.existingAdvanceAmount) < 0.01) ?? null;
  }

  const otherPaymentsTotal = payments
    .filter((p) => p.id !== advancePayment?.id)
    .reduce((sum, p) => sum + toNumber(p.amount), 0);

  let nextAdvance = opts.existingAdvanceAmount;
  if (opts.advanceAmountProvided && opts.nextAdvanceAmount != null) {
    const raw = Number(opts.nextAdvanceAmount);
    nextAdvance = Number.isFinite(raw) ? Math.max(0, raw) : 0;
    const maxAdvance = Math.max(0, opts.totalAmount - otherPaymentsTotal);
    nextAdvance = Math.min(nextAdvance, maxAdvance);
  }

  const advanceMode =
    opts.paymentModeProvided && typeof opts.paymentMode === "string" && opts.paymentMode.trim()
      ? opts.paymentMode.trim()
      : (advancePayment?.mode ?? "cash");
  const advanceCheque = typeof opts.chequeNumber === "string" ? opts.chequeNumber.trim() : "";
  const resolvedCheque =
    advanceMode === "cheque"
      ? advanceCheque || advancePayment?.chequeNumber || null
      : null;

  const shouldTouchAdvance =
    opts.advanceAmountProvided || (opts.paymentModeProvided && advancePayment != null);

  if (shouldTouchAdvance) {
    if (nextAdvance > 0) {
      if (advanceMode === "cheque" && !resolvedCheque) {
        throw new Error("Cheque number is required for cheque advance payment");
      }
      if (advancePayment) {
        await tx.payment.update({
          where: { id: advancePayment.id },
          data: {
            amount: String(nextAdvance),
            mode: advanceMode,
            chequeNumber: resolvedCheque,
          },
        });
      } else {
        await tx.payment.create({
          data: {
            orderId,
            amount: String(nextAdvance),
            mode: advanceMode,
            chequeNumber: resolvedCheque,
            notes: ADVANCE_PAYMENT_NOTE,
          },
        });
      }
    } else if (advancePayment) {
      await tx.payment.delete({ where: { id: advancePayment.id } });
    } else if (opts.paymentModeProvided) {
      // payment mode changed but there is no advance payment row to update
    }
  }

  const refreshedPayments = await tx.payment.findMany({ where: { orderId } });
  const paidAmount = Math.min(
    opts.totalAmount,
    refreshedPayments.reduce((sum, p) => sum + toNumber(p.amount), 0),
  );
  return {
    advanceAmount: nextAdvance,
    paidAmount,
    paymentStatus: derivePaymentStatusFromAmounts(opts.totalAmount, paidAmount),
  };
}

const ORDER_NUMBER_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const ORDER_NUMBER_LENGTH = 5;

const ORDER_NUMBER_PREFIX = "ORD-";

function randomOrderNumberCandidate(): string {
  const bytes = randomBytes(ORDER_NUMBER_LENGTH);
  let suffix = "";
  for (let i = 0; i < ORDER_NUMBER_LENGTH; i++) {
    suffix += ORDER_NUMBER_CHARS[bytes[i]! % ORDER_NUMBER_CHARS.length];
  }
  return `${ORDER_NUMBER_PREFIX}${suffix}`;
}

async function generateOrderNumber(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const orderNumber = randomOrderNumberCandidate();
    const existing = await prisma.order.findUnique({
      where: { orderNumber },
      select: { id: true },
    });
    if (!existing) return orderNumber;
  }
  throw new Error("Failed to generate a unique order number");
}

function normalizeAssigneeUserIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
}

async function assertActiveUserIdsExist(userIds: number[]): Promise<void> {
  if (userIds.length === 0) return;
  const found = await prisma.user.count({ where: { id: { in: userIds }, isActive: true } });
  if (found !== userIds.length) {
    throw new Error("One or more assignees are invalid or inactive");
  }
}

async function replaceOrderAssignees(tx: Prisma.TransactionClient, orderId: number, userIds: number[]): Promise<void> {
  const unique = [...new Set(userIds.filter((n) => Number.isFinite(n) && n > 0))];
  await tx.orderAssignee.deleteMany({ where: { orderId } });
  if (unique.length > 0) {
    await tx.orderAssignee.createMany({ data: unique.map((userId) => ({ orderId, userId })) });
  }
  await tx.order.update({
    where: { id: orderId },
    data: { assignedToId: unique.length > 0 ? unique[0]! : null },
  });
}

/** Payments and invoices reference orders without DB cascade — remove them before deleting the order. */
async function deleteOrderWithDependents(orderId: number): Promise<boolean> {
  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      challanImages: true,
      photoComments: true,
      items: { select: { customImageUrl: true, customImageUrls: true } },
      complaints: { select: { imageUrls: true } },
    },
  });
  if (!existing) return false;

  const uploadUrls = collectOrderUploadUrls(existing);

  await prisma.$transaction(async (tx) => {
    await tx.payment.deleteMany({ where: { orderId } });
    await tx.invoice.deleteMany({ where: { orderId } });
    await tx.order.delete({ where: { id: orderId } });
  });

  deleteUploadFilesByUrl(uploadUrls);

  return true;
}

type ResolvedOrderLine = {
  isCustom: boolean;
  productId: number | null;
  variantId: number | null;
  customName: string | null;
  customImageUrl: string | null;
  customImageUrls: string | null;
  customAttributes: string | null;
  description: string | null;
  quantity: number;
  unitPrice: number;
  gstPercent: number;
  totalPrice: number;
};

async function resolveOrderLineItems(
  items: IncomingLineItem[],
  isGst: boolean,
  db: Pick<typeof prisma, "product" | "productVariant" | "setting"> = prisma,
): Promise<ResolvedOrderLine[]> {
  const settings = await db.setting.findFirst();
  const defaultGst = settings ? toNumber(settings.defaultGstPercent) : 18;
  const resolved: ResolvedOrderLine[] = [];

  for (const item of items) {
    const qty = Number(item.quantity);
    const enteredUnitPrice = Number(item.unitPrice);
    if (isCustomLineItem(item)) {
      const name = item.customName?.trim();
      if (!name) throw new Error("Custom line item name is required");
      const gstPercent = isGst ? defaultGst : 0;
      const breakdown = isGst
        ? breakdownGstInclusiveLine(enteredUnitPrice, qty, gstPercent)
        : breakdownGstExclusiveLine(enteredUnitPrice, qty, gstPercent);
      const imgs = resolveCustomLineImages(item);
      resolved.push({
        isCustom: true,
        productId: null,
        variantId: null,
        customName: name,
        customImageUrl: imgs.customImageUrl,
        customImageUrls: imgs.customImageUrls,
        customAttributes: buildCustomAttributesJson(item),
        description: normalizeLineDescription(item.description),
        quantity: qty,
        unitPrice: breakdown.exclusiveUnitPrice,
        gstPercent,
        totalPrice: breakdown.lineTotal,
      });
      continue;
    }
    const productId = Number(item.productId);
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error(`Product ${productId} not found`);
    const variantId =
      item.variantId != null && Number.isFinite(Number(item.variantId)) && Number(item.variantId) > 0
        ? Number(item.variantId)
        : null;
    if (variantId != null) {
      const variant = await db.productVariant.findUnique({ where: { id: variantId } });
      if (!variant || variant.productId !== productId) {
        throw new Error(`Variant ${variantId} is not valid for product ${productId}`);
      }
    }
    const gstPercent = isGst ? defaultGst : 0;
    const breakdown = isGst
      ? breakdownGstInclusiveLine(enteredUnitPrice, qty, gstPercent)
      : breakdownGstExclusiveLine(enteredUnitPrice, qty, gstPercent);
    resolved.push({
      isCustom: false,
      productId,
      variantId,
      customName: null,
      customImageUrl: null,
      customImageUrls: null,
      customAttributes: null,
      description: normalizeLineDescription(item.description),
      quantity: qty,
      unitPrice: breakdown.exclusiveUnitPrice,
      gstPercent,
      totalPrice: breakdown.lineTotal,
    });
  }
  return resolved;
}

async function enrichOrder(order: any) {
  const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
  const enrichedItems = await Promise.all(items.map(async (item) => {
    const product =
      item.productId != null ? await prisma.product.findUnique({ where: { id: item.productId } }) : null;
    const variant =
      item.variantId != null
        ? await prisma.productVariant.findUnique({ where: { id: item.variantId } })
        : null;
    const customImageUrls = parseImageUrlsJson(item.customImageUrls, item.customImageUrl);
    return {
      ...item,
      isCustom: item.isCustom,
      customName: item.customName,
      customImageUrl: customImageUrls[0] ?? null,
      customImageUrls,
      customAttributes: item.customAttributes,
      unitPrice: toNumber(item.unitPrice),
      gstPercent: toNumber(item.gstPercent),
      totalPrice: toNumber(item.totalPrice),
      product: product ? { ...product, price: toNumber(product.price), gstPercent: toNumber(product.gstPercent) } : null,
      variant: variant
        ? {
            ...variant,
            price: variant.price != null ? toNumber(variant.price) : null,
          }
        : null,
    };
  }));
  let branch: Awaited<ReturnType<typeof prisma.branch.findUnique>> = null;
  let assignedTo: Awaited<ReturnType<typeof prisma.user.findUnique>> = null;
  if (order.branchId) {
    const b = await prisma.branch.findUnique({ where: { id: order.branchId } });
    if (b) branch = b;
  }
  const assigneeRows = await prisma.orderAssignee.findMany({
    where: { orderId: order.id },
    include: { user: { select: { id: true, name: true, mobile: true } } },
    orderBy: [{ userId: "asc" }],
  });
  let assignees: Array<{ id: number; name: string; mobile: string }> = assigneeRows
    .map((r) => r.user)
    .filter((u): u is { id: number; name: string; mobile: string } => u != null);
  if (assignees.length === 0 && order.assignedToId) {
    const u = await prisma.user.findUnique({
      where: { id: order.assignedToId },
      select: { id: true, name: true, mobile: true },
    });
    if (u) {
      assignees = [u as any];
      assignedTo = u as any;
    }
  } else if (assignees.length > 0) {
    assignedTo = assignees[0] as any;
  } else if (order.assignedToId) {
    const u = await prisma.user.findUnique({
      where: { id: order.assignedToId },
      select: { id: true, name: true, mobile: true },
    });
    if (u) assignedTo = u as any;
  }
  let createdBy: { id: number; name: string; mobile: string } | null = null;
  const creatorId = (order as { createdById?: number | null }).createdById;
  if (creatorId) {
    const c = await prisma.user.findUnique({
      where: { id: creatorId },
      select: { id: true, name: true, mobile: true },
    });
    if (c) createdBy = c as any;
  }
  let deliverySlot: Awaited<ReturnType<typeof prisma.deliverySlot.findUnique>> = null;
  if (DELIVERY_SLOTS_ENABLED && order.deliverySlotId) {
    const ds = await prisma.deliverySlot.findUnique({ where: { id: order.deliverySlotId } });
    if (ds) deliverySlot = ds;
  }
  const deliveryAssignees = await loadDeliveryAssigneesForOrder(order.id);
  const eo = order as { driverId?: number | null; deliveryCharge?: unknown };
  let driver: { id: number; name: string; mobile: string | null; vehicleInfo: string | null } | null = null;
  if (eo.driverId) {
    const d = await prisma.driver.findUnique({
      where: { id: eo.driverId },
      select: { id: true, name: true, mobile: true, vehicleInfo: true },
    });
    if (d) driver = d;
  }
  return {
    ...order,
    driverId: eo.driverId ?? null,
    isGst: Boolean(order.isGst),
    status: normalizeMainOrderStatus(order.status ?? "order_received"),
    paymentStatus: order.paymentStatus ?? "due",
    deliveryStatus: normalizeDeliveryStatus((order as { deliveryStatus?: string }).deliveryStatus),
    advanceAmount: toNumber(order.advanceAmount ?? 0),
    deliveryDate: order.deliveryDate ?? null,
    deliveryCharge: toNumber((order as { deliveryCharge?: unknown }).deliveryCharge ?? 0),
    driver,
    addressLat: order.addressLat != null ? toNumber(order.addressLat) : null,
    addressLng: order.addressLng != null ? toNumber(order.addressLng) : null,
    subtotal: toNumber(order.subtotal),
    taxAmount: toNumber(order.taxAmount),
    totalAmount: toNumber(order.totalAmount),
    paidAmount: toNumber(order.paidAmount),
    challanImages: safeJsonParse<string[]>(order.challanImages, []),
    photoComments: safeJsonParse<Array<{ imageUrl: string; comment?: string }>>(order.photoComments, []),
    staffComments: safeJsonParse<Array<{ comment: string; authorName?: string; createdAt: string }>>(order.staffComments, []),
    deliveryComments: safeJsonParse<Array<{ comment: string; authorName?: string; createdAt: string }>>(
      (order as { deliveryComments?: string | null }).deliveryComments,
      [],
    ),
    items: enrichedItems,
    branch,
    assignedTo,
    assignees,
    deliveryAssignees,
    createdBy,
    deliverySlot: deliverySlot
      ? {
          id: deliverySlot.id,
          label: deliverySlot.label,
          startTime: deliverySlot.startTime,
          endTime: deliverySlot.endTime,
          slotDate: deliverySlot.slotDate,
          maxOrders: deliverySlot.maxOrders,
        }
      : null,
  };
}

router.post(
  "/orders/upload-image",
  requireAuth,
  requirePermission("orders", "update"),
  orderImageUpload.single("image"),
  (req, res): void => {
    if (!(req as any).file) {
      res.status(400).json({ error: "Image file is required (field name: image)" });
      return;
    }
    const filename = (req as any).file.filename as string;
    res.json({ imageUrl: `/uploads/orders/${filename}` });
  },
);

router.get("/orders", requireAuth, requirePermission("orders", "read"), async (req, res): Promise<void> => {
  const {
    search,
    status,
    isGst,
    branchId,
    page = "1",
    limit = "20",
    assignmentScope,
    createdFrom,
    createdTo,
    categoryId,
    paymentStatus,
    sort,
  } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const authUser = (req as { user?: { id: number; isSales?: boolean; ordersListScope?: string | null } }).user;
  const userId = authUser?.id;

  const where: any = {};
  if (status) {
    if (status === "complete") {
      where.status = { in: ["complete", "delivered"] };
    } else {
      where.status = status;
    }
  }
  if (isGst !== undefined) where.isGst = isGst === "true";
  if (branchId) where.branchId = parseInt(branchId, 10);

  if (typeof paymentStatus === "string" && paymentStatus.trim() && paymentStatus !== "all") {
    const ps = paymentStatus.trim();
    if (ps === "paid") {
      where.paymentStatus = "paid";
    } else if (ps === "unpaid") {
      where.paymentStatus = { in: ["due", "partially_paid"] };
    } else if (PAYMENT_STATUSES.has(ps)) {
      where.paymentStatus = ps;
    }
  }

  const sortDirection: "asc" | "desc" = sort === "oldest" ? "asc" : "desc";

  const createdAtFilter: { gte?: Date; lte?: Date } = {};
  if (typeof createdFrom === "string" && createdFrom.trim()) {
    const start = ymdUtcDayStart(createdFrom.trim());
    if (start) createdAtFilter.gte = start;
  }
  if (typeof createdTo === "string" && createdTo.trim()) {
    const end = ymdUtcDayEnd(createdTo.trim());
    if (end) createdAtFilter.lte = end;
  }
  if (createdAtFilter.gte != null || createdAtFilter.lte != null) {
    where.createdAt = createdAtFilter;
  }

  const clauses: any[] = [];
  if (search) {
    clauses.push({
      OR: [
        { customerName: { contains: search, mode: "insensitive" } },
        { orderNumber: { contains: search, mode: "insensitive" } },
      ],
    });
  }
  const effectiveScope = authUser
    ? resolveOrdersAssignmentScope(authUser, assignmentScope)
    : null;
  if (effectiveScope && userId != null) {
    clauses.push(assignmentScopeWhere(effectiveScope, userId));
  }
  const categoryIds = await resolveCategoryFilterIds(categoryId);
  if (categoryIds) {
    clauses.push(orderHasProductInCategories(categoryIds));
  }
  if (clauses.length === 1) {
    Object.assign(where, clauses[0]);
  } else if (clauses.length > 1) {
    where.AND = clauses;
  }

  const total = await prisma.order.count({ where });
  const orders = await prisma.order.findMany({
    where,
    skip: offset,
    take: limitNum,
    orderBy: [{ createdAt: sortDirection }, { id: sortDirection }],
  });
  const data = await Promise.all(orders.map(enrichOrder));
  res.json({ data, total, page: pageNum, limit: limitNum });
});

/** Pick assignees on the order form — allowed with orders create/update, without users module read. */
router.get(
  "/orders/assignable-users",
  requireAuth,
  requirePermissionAny([
    { module: "orders", action: "create" },
    { module: "orders", action: "update" },
  ]),
  async (req, res): Promise<void> => {
    const user = (req as { user?: { branchId: number | null; userBranches?: { branchId: number }[] } }).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const branchId = await requireWriteBranchId(req, res, user);
    if (branchId == null) return;

    const { search } = req.query as Record<string, string>;
    const limitRaw = (req.query as Record<string, string>).limit;
    const limitNum = Math.min(2000, Math.max(1, parseInt(limitRaw || "1000", 10) || 1000));
    const searchTrim = search?.trim() ?? "";

    const branchScope: Prisma.UserWhereInput = {
      OR: [
        { role: { name: "Super Admin" } },
        { userBranches: { some: { branchId } } },
        {
          AND: [{ userBranches: { none: {} } }, { branchId }],
        },
        {
          AND: [{ userBranches: { none: {} } }, { branchId: null }],
        },
      ],
    };

    const where: Prisma.UserWhereInput = {
      isActive: true,
      AND: [
        branchScope,
        ...(searchTrim
          ? [
              {
                OR: [
                  { name: { contains: searchTrim, mode: "insensitive" } },
                  { mobile: { contains: searchTrim } },
                ],
              } satisfies Prisma.UserWhereInput,
            ]
          : []),
      ],
    };

    const rows = await prisma.user.findMany({
      where,
      take: limitNum,
      select: {
        id: true,
        name: true,
        mobile: true,
        role: { select: { name: true } },
      },
      orderBy: [{ name: "asc" }],
    });

    res.json({
      data: rows.map((u) => ({
        id: u.id,
        name: u.name,
        mobile: u.mobile,
        roleName: u.role?.name ?? null,
      })),
    });
  },
);

router.post("/orders", requireAuth, requirePermission("orders", "create"), async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const user = (req as { user?: { branchId: number | null; userBranches?: { branchId: number }[] } }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const branchId = await requireWriteBranchId(req, res, user);
  if (branchId == null) return;

  const {
    items,
    branchId: _clientBranch,
    deliverySlotId: inputDeliverySlotId,
    customerPincode,
    addressLat,
    addressLng,
    googlePlaceId,
    deliveryStatus,
    assigneeUserIds: inputAssigneeUserIds,
    deliveryAssigneeUserIds: inputDeliveryAssigneeUserIds,
    assignedToId: clientAssignedToId,
    ...orderData
  } = parsed.data as any;
  let resolvedItems: ResolvedOrderLine[];
  try {
    resolvedItems = await resolveOrderLineItems(items as IncomingLineItem[], !!orderData.isGst);
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    return;
  }
  let subtotal = 0;
  let taxAmount = 0;
  for (const item of resolvedItems) {
    const itemSubtotal = item.unitPrice * item.quantity;
    const itemTax = (itemSubtotal * item.gstPercent) / 100;
    subtotal += itemSubtotal;
    taxAmount += itemTax;
  }

  const deliveryCharge = parseDeliveryCharge(orderData.deliveryCharge);
  // Delivery charge is tracked separately and is NOT rolled into the order total used for
  // payment summary, paid/due balance, payment status, exports, or invoices.
  const totalAmount = subtotal + taxAmount;
  const advanceAmount = Number(orderData.advanceAmount ?? 0);
  const safeAdvanceAmount = Number.isFinite(advanceAmount) ? Math.max(0, Math.min(totalAmount, advanceAmount)) : 0;
  const requestedStatusRaw = typeof orderData.status === "string" ? orderData.status : "order_received";
  const requestedStatus = requestedStatusRaw === "delivered" ? "complete" : requestedStatusRaw;
  const status = ORDER_STATUSES.has(requestedStatus) ? requestedStatus : "order_received";
  const requestedPaymentStatus = typeof orderData.paymentStatus === "string" ? orderData.paymentStatus : undefined;
  const paymentStatus = normalizePaymentStatus(totalAmount, safeAdvanceAmount, requestedPaymentStatus);
  let orderNumber: string;
  try {
    orderNumber = await generateOrderNumber();
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    return;
  }

  const assigneeIdsFromBody = Array.isArray(inputAssigneeUserIds)
    ? normalizeAssigneeUserIds(inputAssigneeUserIds)
    : clientAssignedToId != null && Number.isFinite(Number(clientAssignedToId))
      ? [Number(clientAssignedToId)]
      : [];

  const deliveryAssigneeIdsFromBody = Array.isArray(inputDeliveryAssigneeUserIds)
    ? normalizeAssigneeUserIds(inputDeliveryAssigneeUserIds)
    : [];

  let resolvedDriverId: number | null = null;
  try {
    await assertActiveUserIdsExist(assigneeIdsFromBody);
    await assertActiveUserIdsExist(deliveryAssigneeIdsFromBody);
    resolvedDriverId = await resolveDriverIdForOrder(orderData.driverId, branchId);
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    return;
  }

  const actor = (req as { user?: { id: number } }).user;
  const actorId = actor?.id ?? null;

  let createdOrder;
  try {
    createdOrder = await prisma.$transaction(async (tx) => {
      const pincode =
        typeof customerPincode === "string" && customerPincode.trim() ? customerPincode.trim() : null;
      const deliveryDateObj = orderData.deliveryDate ? new Date(orderData.deliveryDate) : null;
      let resolvedDeliverySlotId: number | null = null;
      if (DELIVERY_SLOTS_ENABLED) {
        resolvedDeliverySlotId =
          typeof inputDeliverySlotId === "number" && Number.isFinite(inputDeliverySlotId)
            ? inputDeliverySlotId
            : null;
        if (deliveryDateObj) {
          if (resolvedDeliverySlotId != null) {
            const v = await assertValidOrderDeliverySlot(tx, {
              branchId,
              deliverySlotId: resolvedDeliverySlotId,
              deliveryDate: deliveryDateObj,
              pincode,
            });
            if (!v.ok) throw new Error(v.error);
          } else {
            resolvedDeliverySlotId = await pickBestDeliverySlot(tx, {
              branchId,
              deliveryDate: deliveryDateObj,
              pincode,
            });
          }
        } else {
          resolvedDeliverySlotId = null;
        }
      }

      const order = await tx.order.create({
        data: {
          ...orderData,
          branchId,
          status,
          paymentStatus,
          advanceAmount: String(safeAdvanceAmount),
          orderNumber,
          subtotal: String(subtotal),
          taxAmount: String(taxAmount),
          deliveryCharge: String(deliveryCharge),
          totalAmount: String(totalAmount),
          paidAmount: String(safeAdvanceAmount),
          driverId: resolvedDriverId,
          challanImages: JSON.stringify(Array.isArray(orderData.challanImages) ? orderData.challanImages : []),
          photoComments: JSON.stringify(Array.isArray(orderData.photoComments) ? orderData.photoComments : []),
          staffComments: JSON.stringify(Array.isArray(orderData.staffComments) ? orderData.staffComments : []),
          deliveryComments: JSON.stringify(
            Array.isArray(orderData.deliveryComments) ? orderData.deliveryComments : [],
          ),
          assignedToId: assigneeIdsFromBody[0] ?? null,
          createdById: actorId,
          deliveryDate: orderData.deliveryDate ? new Date(orderData.deliveryDate) : null,
          deliverySlotId: resolvedDeliverySlotId,
          deliveryStatus: "pending",
          customerPincode: pincode,
          googlePlaceId: typeof googlePlaceId === "string" && googlePlaceId.trim() ? googlePlaceId.trim() : null,
          addressLat:
            addressLat != null && addressLat !== "" && Number.isFinite(Number(addressLat))
              ? Number(addressLat)
              : null,
          addressLng:
            addressLng != null && addressLng !== "" && Number.isFinite(Number(addressLng))
              ? Number(addressLng)
              : null,
        },
      });

      await replaceOrderAssignees(tx, order.id, assigneeIdsFromBody);
      await replaceOrderDeliveryAssignees(tx, order.id, deliveryAssigneeIdsFromBody);

      for (const item of resolvedItems) {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            isCustom: item.isCustom,
            productId: item.productId,
            variantId: item.variantId,
            customName: item.customName,
            customImageUrl: item.customImageUrl,
            customImageUrls: item.customImageUrls,
            customAttributes: item.customAttributes,
            description: item.description,
            quantity: item.quantity,
            unitPrice: String(item.unitPrice),
            gstPercent: String(item.gstPercent),
            totalPrice: String(item.totalPrice),
          },
        });
        if (!item.isCustom && item.productId != null) {
          const movements = await decrementProductStock(item.productId, item.quantity, tx, item.variantId);
          for (const movement of movements) {
            await tx.inventoryLog.create({
              data: {
                productId: movement.productId,
                variantId: movement.variantId,
                type: "out",
                quantity: movement.quantity,
                notes: `Order ${orderNumber}`,
                branchId,
              },
            });
          }
        }
      }

      const settings = await tx.setting.findFirst();
      const invoicePrefix = settings?.invoicePrefix || "INV";
      const invoiceNumber = `${invoicePrefix}-${Date.now()}`;
      const cgst = orderData.isGst ? taxAmount / 2 : 0;
      const sgst = orderData.isGst ? taxAmount / 2 : 0;

      await tx.invoice.create({
        data: {
          invoiceNumber,
          orderId: order.id,
          isGst: orderData.isGst,
          cgst: String(cgst),
          sgst: String(sgst),
          igst: "0",
          totalAmount: String(totalAmount),
        },
      });
      if (safeAdvanceAmount > 0) {
        const advanceMode = orderData.paymentMode ?? "cash";
        const advanceCheque =
          typeof orderData.chequeNumber === "string" ? orderData.chequeNumber.trim() : "";
        if (advanceMode === "cheque" && !advanceCheque) {
          throw new Error("Cheque number is required for cheque advance payment");
        }
        await tx.payment.create({
          data: {
            orderId: order.id,
            amount: String(safeAdvanceAmount),
            mode: advanceMode,
            chequeNumber: advanceMode === "cheque" ? advanceCheque : null,
            notes: ADVANCE_PAYMENT_NOTE,
          },
        });
      }

      return order;
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Insufficient stock across variants") {
      res.status(400).json({ error: "Insufficient stock for one or more products" });
      return;
    }
    res.status(500).json({ error: msg });
    return;
  }

  emitSafe("ORDER_CREATED", {
    orderId: createdOrder.id,
    orderNumber: createdOrder.orderNumber,
    branchId: createdOrder.branchId,
    assignedToId: createdOrder.assignedToId,
    createdById: actorId ?? undefined,
  });

  res.status(201).json(await enrichOrder(createdOrder));
});

router.get("/orders/:id", requireAuth, requirePermission("orders", "read"), async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const authUser = (req as { user?: { id: number; isSales?: boolean; ordersListScope?: string | null } }).user;
  if (!authUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const access = await assertOrderAccessibleBySalesScope(params.data.id, authUser);
  if (!access.ok) {
    res.status(access.status).json({ error: access.message });
    return;
  }
  const order = await prisma.order.findUnique({ where: { id: params.data.id } });
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(await enrichOrder(order));
});

router.put("/orders/:id", requireAuth, requirePermission("orders", "update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const existingOrder = await prisma.order.findUnique({ where: { id } });
  if (!existingOrder) { res.status(404).json({ error: "Order not found" }); return; }

  const prevAssigneeRows = await prisma.orderAssignee.findMany({
    where: { orderId: id },
    select: { userId: true },
  });
  const prevAssigneeKey =
    prevAssigneeRows.length > 0
      ? assigneeIdsKey(prevAssigneeRows.map((r) => r.userId))
      : existingOrder.assignedToId != null
        ? String(existingOrder.assignedToId)
        : "";

  const user = (req as {
    user?: {
      id: number;
      branchId: number | null;
      userBranches?: { branchId: number }[];
      isSales?: boolean;
      ordersListScope?: string | null;
    };
  }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const access = await assertOrderAccessibleBySalesScope(id, user);
  if (!access.ok) {
    res.status(access.status).json({ error: access.message });
    return;
  }
  const logBranchId = await resolveLogBranchId(req, user, existingOrder.branchId);

  const existingItems = await prisma.orderItem.findMany({ where: { orderId: id } });
  const payload = parsed.data as any;
  if (payload.deliveryStatus !== undefined) {
    const delAccess = await assertCanUpdateOrderDeliveryStatus(
      user as { id: number; role?: { name?: string | null } | null },
      id,
    );
    if (!delAccess.ok) {
      res.status(delAccess.status).json({ error: delAccess.message });
      return;
    }
  }

  const assigned = assignedBranchIds(user);
  let nextOrderBranchId: number | null = existingOrder.branchId;
  if (assigned.length === 1) {
    const home = await prisma.branch.findFirst({ where: { id: assigned[0], isActive: true }, select: { id: true } });
    if (home) nextOrderBranchId = assigned[0];
  } else if (assigned.length > 1) {
    if (payload.branchId != null) {
      const bid = typeof payload.branchId === "number" ? payload.branchId : parseInt(String(payload.branchId), 10);
      if (Number.isFinite(bid) && assigned.includes(bid)) {
        const b = await prisma.branch.findFirst({ where: { id: bid, isActive: true }, select: { id: true } });
        if (b) nextOrderBranchId = bid;
      }
    }
    if (nextOrderBranchId == null && logBranchId != null && assigned.includes(logBranchId)) {
      nextOrderBranchId = logBranchId;
    }
  } else {
    if (payload.branchId != null) {
      const bid = typeof payload.branchId === "number" ? payload.branchId : parseInt(String(payload.branchId), 10);
      if (Number.isFinite(bid)) {
        const b = await prisma.branch.findFirst({ where: { id: bid, isActive: true }, select: { id: true } });
        if (b) nextOrderBranchId = bid;
      }
    }
    if (nextOrderBranchId == null && logBranchId != null) {
      nextOrderBranchId = logBranchId;
    }
  }

  const nextIsGst = payload.isGst ?? existingOrder.isGst;
  const nextItems = Array.isArray(payload.items)
    ? payload.items
    : existingItems.map((item) => ({
        isCustom: item.isCustom,
        productId: item.productId,
        variantId: item.variantId,
        customName: item.customName,
        customImageUrl: item.customImageUrl,
        customImageUrls: parseImageUrlsJson(item.customImageUrls, item.customImageUrl),
        customAttributes: item.customAttributes,
        quantity: item.quantity,
        unitPrice: toNumber(item.unitPrice),
      }));

  let resolvedItems: ResolvedOrderLine[];
  try {
    resolvedItems = await resolveOrderLineItems(nextItems as IncomingLineItem[], !!nextIsGst);
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    return;
  }

  let subtotal = 0;
  let taxAmount = 0;
  for (const item of resolvedItems) {
    const itemSubtotal = item.unitPrice * item.quantity;
    const itemTax = (itemSubtotal * item.gstPercent) / 100;
    subtotal += itemSubtotal;
    taxAmount += itemTax;
  }

  const nextDeliveryCharge =
    payload.deliveryCharge !== undefined
      ? parseDeliveryCharge(payload.deliveryCharge)
      : toNumber((existingOrder as { deliveryCharge?: unknown }).deliveryCharge ?? 0);
  // Delivery charge stays as a separate column; it is NOT included in totalAmount.
  const totalAmount = subtotal + taxAmount;
  const advanceAmountProvided = Object.prototype.hasOwnProperty.call(payload, "advanceAmount");
  const paymentModeProvided = Object.prototype.hasOwnProperty.call(payload, "paymentMode");

  const stockKey = (productId: number, variantId?: number | null) => `${productId}:${variantId ?? "product"}`;
  const previousQtyByStockKey = new Map<string, { productId: number; variantId: number | null; quantity: number }>();
  for (const item of existingItems) {
    if (item.productId == null) continue;
    const key = stockKey(item.productId, item.variantId);
    const previous = previousQtyByStockKey.get(key);
    previousQtyByStockKey.set(key, {
      productId: item.productId,
      variantId: item.variantId ?? null,
      quantity: (previous?.quantity ?? 0) + item.quantity,
    });
  }
  const nextQtyByStockKey = new Map<string, { productId: number; variantId: number | null; quantity: number }>();
  for (const item of resolvedItems) {
    if (item.productId == null) continue;
    const key = stockKey(item.productId, item.variantId);
    const previous = nextQtyByStockKey.get(key);
    nextQtyByStockKey.set(key, {
      productId: item.productId,
      variantId: item.variantId ?? null,
      quantity: (previous?.quantity ?? 0) + item.quantity,
    });
  }
  const stockKeys = new Set<string>([...previousQtyByStockKey.keys(), ...nextQtyByStockKey.keys()]);

  let nextDriverId: number | null = (existingOrder as { driverId?: number | null }).driverId ?? null;
  if (payload.driverId !== undefined) {
    try {
      nextDriverId = await resolveDriverIdForOrder(payload.driverId, nextOrderBranchId);
    } catch (e: unknown) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
      return;
    }
  }

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      for (const key of stockKeys) {
        const previousStock = previousQtyByStockKey.get(key);
        const nextStock = nextQtyByStockKey.get(key);
        const productId = (nextStock ?? previousStock)!.productId;
        const variantId = (nextStock ?? previousStock)!.variantId;
        const previousQty = previousStock?.quantity ?? 0;
        const nextQty = nextStock?.quantity ?? 0;
        const delta = nextQty - previousQty;
        if (delta === 0) continue;

        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product) throw new Error(`Product ${productId} not found while updating stock`);

        if (delta > 0) {
          const movements = await decrementProductStock(productId, delta, tx, variantId);
          for (const movement of movements) {
            await tx.inventoryLog.create({
              data: {
                productId: movement.productId,
                variantId: movement.variantId,
                type: "out",
                quantity: movement.quantity,
                notes: `Order ${existingOrder.orderNumber} updated`,
                branchId: logBranchId,
              },
            });
          }
        } else {
          const returnQty = Math.abs(delta);
          const movements = await incrementProductStock(productId, returnQty, tx, variantId);
          for (const movement of movements) {
            await tx.inventoryLog.create({
              data: {
                productId: movement.productId,
                variantId: movement.variantId,
                type: "in",
                quantity: movement.quantity,
                notes: `Order ${existingOrder.orderNumber} updated (restock)`,
                branchId: logBranchId,
              },
            });
          }
        }
      }

      await tx.orderItem.deleteMany({ where: { orderId: id } });
      await tx.orderItem.createMany({
        data: resolvedItems.map((item) => ({
          orderId: id,
          isCustom: item.isCustom,
          productId: item.productId,
          variantId: item.variantId,
          customName: item.customName,
          customImageUrl: item.customImageUrl,
          customImageUrls: item.customImageUrls,
          customAttributes: item.customAttributes,
          description: item.description,
          quantity: item.quantity,
          unitPrice: String(item.unitPrice),
          gstPercent: String(item.gstPercent),
          totalPrice: String(item.totalPrice),
        })),
      });

      const {
        items: _ignoredItems,
        branchId: _omitBranch,
        deliverySlotId: payloadDeliverySlotId,
        deliveryStatus: payloadDeliveryStatus,
        customerPincode: payloadCustomerPincode,
        addressLat: payloadAddressLat,
        addressLng: payloadAddressLng,
        googlePlaceId: payloadGooglePlaceId,
        assigneeUserIds: payloadAssigneeUserIds,
        deliveryAssigneeUserIds: payloadDeliveryAssigneeUserIds,
        assignedToId: payloadAssignedToIdField,
        driverId: _payloadDriverId,
        deliveryCharge: _payloadDeliveryCharge,
        advanceAmount: _payloadAdvanceAmount,
        paymentMode: _payloadPaymentMode,
        paymentStatus: _payloadPaymentStatus,
        paidAmount: _payloadPaidAmount,
        chequeNumber: _payloadChequeNumber,
        ...orderFields
      } = payload;
      const eo = existingOrder as any;
      const requestedStatusRaw =
        typeof orderFields.status === "string"
          ? orderFields.status
          : String(existingOrder.status || "order_received");
      const requestedStatusNorm = requestedStatusRaw === "delivered" ? "complete" : requestedStatusRaw;
      const safeStatus = ORDER_STATUSES.has(requestedStatusNorm)
        ? requestedStatusNorm
        : normalizeMainOrderStatus(String(existingOrder.status));

      const branchForSlot = nextOrderBranchId ?? existingOrder.branchId;
      if (branchForSlot == null) throw new Error("Order has no branch for delivery scheduling");

      const nextDeliveryDate =
        orderFields.deliveryDate !== undefined
          ? orderFields.deliveryDate != null && String(orderFields.deliveryDate) !== ""
            ? new Date(orderFields.deliveryDate)
            : null
          : existingOrder.deliveryDate;

      const nextPin =
        payloadCustomerPincode !== undefined
          ? typeof payloadCustomerPincode === "string" && payloadCustomerPincode.trim()
            ? payloadCustomerPincode.trim()
            : null
          : (eo.customerPincode ?? null);

      let nextSlotId: number | null = DELIVERY_SLOTS_ENABLED ? (eo.deliverySlotId ?? null) : null;
      if (DELIVERY_SLOTS_ENABLED) {
        if (payloadDeliverySlotId !== undefined) {
          nextSlotId =
            typeof payloadDeliverySlotId === "number" && Number.isFinite(payloadDeliverySlotId)
              ? payloadDeliverySlotId
              : null;
          if (nextSlotId != null && nextDeliveryDate) {
            const v = await assertValidOrderDeliverySlot(tx, {
              branchId: branchForSlot,
              deliverySlotId: nextSlotId,
              deliveryDate: nextDeliveryDate,
              pincode: nextPin,
              excludeOrderId: id,
            });
            if (!v.ok) throw new Error(v.error);
          }
        } else {
          nextSlotId = eo.deliverySlotId ?? null;
          if (nextDeliveryDate) {
            if (nextSlotId != null) {
              const v = await assertValidOrderDeliverySlot(tx, {
                branchId: branchForSlot,
                deliverySlotId: nextSlotId,
                deliveryDate: nextDeliveryDate,
                pincode: nextPin,
                excludeOrderId: id,
              });
              if (!v.ok) {
                nextSlotId = await pickBestDeliverySlot(tx, {
                  branchId: branchForSlot,
                  deliveryDate: nextDeliveryDate,
                  pincode: nextPin,
                  excludeOrderId: id,
                });
              }
            } else {
              nextSlotId = await pickBestDeliverySlot(tx, {
                branchId: branchForSlot,
                deliveryDate: nextDeliveryDate,
                pincode: nextPin,
                excludeOrderId: id,
              });
            }
          } else {
            nextSlotId = null;
          }
        }
      }

      const nextDelStatus =
        payloadDeliveryStatus !== undefined
          ? normalizeDeliveryStatus(payloadDeliveryStatus)
          : normalizeDeliveryStatus(eo.deliveryStatus);

      const prevDel = normalizeDeliveryStatus(eo.deliveryStatus);
      if (payloadDeliveryStatus !== undefined) {
        const t = assertDeliveryStatusTransition({
          mainStatus: safeStatus,
          prevDelivery: prevDel,
          nextDelivery: nextDelStatus,
        });
        if (!t.ok) throw new Error(t.error);
      }
      const coh = assertOrderDeliveryCoherence(safeStatus, nextDelStatus);
      if (!coh.ok) throw new Error(coh.error);

      const nextLat =
        payloadAddressLat !== undefined
          ? payloadAddressLat != null &&
            String(payloadAddressLat) !== "" &&
            Number.isFinite(Number(payloadAddressLat))
            ? Number(payloadAddressLat)
            : null
          : eo.addressLat != null
            ? toNumber(eo.addressLat)
            : null;
      const nextLng =
        payloadAddressLng !== undefined
          ? payloadAddressLng != null &&
            String(payloadAddressLng) !== "" &&
            Number.isFinite(Number(payloadAddressLng))
            ? Number(payloadAddressLng)
            : null
          : eo.addressLng != null
            ? toNumber(eo.addressLng)
            : null;

      const nextPlaceId =
        payloadGooglePlaceId !== undefined
          ? typeof payloadGooglePlaceId === "string" && payloadGooglePlaceId.trim()
            ? payloadGooglePlaceId.trim()
            : null
          : eo.googlePlaceId ?? null;

      const normalizedChallanImages = Array.isArray(orderFields.challanImages) ? orderFields.challanImages : safeJsonParse<string[]>(existingOrder.challanImages, []);
      const normalizedPhotoComments = Array.isArray(orderFields.photoComments) ? orderFields.photoComments : safeJsonParse<any[]>(existingOrder.photoComments, []);
      const normalizedStaffComments = Array.isArray(orderFields.staffComments) ? orderFields.staffComments : safeJsonParse<any[]>(existingOrder.staffComments, []);
      const normalizedDeliveryComments = Array.isArray(orderFields.deliveryComments)
        ? orderFields.deliveryComments
        : safeJsonParse<any[]>((existingOrder as { deliveryComments?: string | null }).deliveryComments, []);

      let nextAdvanceAmount = toNumber(existingOrder.advanceAmount);
      let nextPaidAmount = toNumber(existingOrder.paidAmount);
      let nextPaymentStatus = normalizePaymentStatus(totalAmount, nextPaidAmount, payload.paymentStatus);
      let nextPaymentMode = (existingOrder as { paymentMode?: string | null }).paymentMode ?? null;

      if (advanceAmountProvided || paymentModeProvided) {
        const synced = await syncAdvancePaymentOnOrderUpdate(tx, id, {
          totalAmount,
          existingAdvanceAmount: toNumber(existingOrder.advanceAmount),
          nextAdvanceAmount: advanceAmountProvided ? Number(payload.advanceAmount ?? 0) : undefined,
          paymentMode: paymentModeProvided
            ? payload.paymentMode
            : (existingOrder as { paymentMode?: string | null }).paymentMode,
          chequeNumber: typeof payload.chequeNumber === "string" ? payload.chequeNumber : null,
          advanceAmountProvided,
          paymentModeProvided,
        });
        nextAdvanceAmount = synced.advanceAmount;
        nextPaidAmount = synced.paidAmount;
        nextPaymentStatus = advanceAmountProvided
          ? synced.paymentStatus
          : normalizePaymentStatus(totalAmount, synced.paidAmount, payload.paymentStatus);
        if (paymentModeProvided && typeof payload.paymentMode === "string") {
          nextPaymentMode = payload.paymentMode;
        }
      } else if (totalAmount !== toNumber(existingOrder.totalAmount)) {
        nextPaymentStatus = normalizePaymentStatus(totalAmount, nextPaidAmount, payload.paymentStatus);
      }

      await tx.order.update({
        where: { id },
        data: {
          ...orderFields,
          branchId: nextOrderBranchId,
          status: safeStatus,
          advanceAmount: String(nextAdvanceAmount),
          paidAmount: String(nextPaidAmount),
          paymentStatus: nextPaymentStatus,
          ...(paymentModeProvided ? { paymentMode: nextPaymentMode } : {}),
          subtotal: String(subtotal),
          taxAmount: String(taxAmount),
          deliveryCharge: String(nextDeliveryCharge),
          totalAmount: String(totalAmount),
          ...(payload.driverId !== undefined ? { driverId: nextDriverId } : {}),
          challanImages: JSON.stringify(normalizedChallanImages),
          photoComments: JSON.stringify(normalizedPhotoComments),
          staffComments: JSON.stringify(normalizedStaffComments),
          deliveryComments: JSON.stringify(normalizedDeliveryComments),
          deliveryDate: nextDeliveryDate,
          deliverySlotId: nextSlotId,
          deliveryStatus: nextDelStatus,
          customerPincode: nextPin,
          addressLat: nextLat,
          addressLng: nextLng,
          googlePlaceId: nextPlaceId,
        },
      });

      if (
        Object.prototype.hasOwnProperty.call(payload, "assigneeUserIds") ||
        Object.prototype.hasOwnProperty.call(payload, "assignedToId")
      ) {
        const nextAssigneeIds = Object.prototype.hasOwnProperty.call(payload, "assigneeUserIds")
          ? normalizeAssigneeUserIds(payloadAssigneeUserIds)
          : payloadAssignedToIdField != null && Number.isFinite(Number(payloadAssignedToIdField))
            ? [Number(payloadAssignedToIdField)]
            : [];
        await assertActiveUserIdsExist(nextAssigneeIds);
        await replaceOrderAssignees(tx, id, nextAssigneeIds);
      }

      if (Object.prototype.hasOwnProperty.call(payload, "deliveryAssigneeUserIds")) {
        const nextDeliveryAssigneeIds = normalizeAssigneeUserIds(payloadDeliveryAssigneeUserIds);
        await assertActiveUserIdsExist(nextDeliveryAssigneeIds);
        await replaceOrderDeliveryAssignees(tx, id, nextDeliveryAssigneeIds);
      }

      const invoice = await tx.invoice.findFirst({ where: { orderId: id } });
      if (invoice) {
        const cgst = nextIsGst ? taxAmount / 2 : 0;
        const sgst = nextIsGst ? taxAmount / 2 : 0;
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            isGst: nextIsGst,
            cgst: String(cgst),
            sgst: String(sgst),
            igst: "0",
            totalAmount: String(totalAmount),
          },
        });
      }

      return (await tx.order.findUnique({ where: { id } }))!;
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Insufficient stock across variants") {
      res.status(400).json({ error: "Insufficient stock for one or more products" });
      return; 
    }
    res.status(400).json({ error: msg || "Failed to update order" });
    return;
  }

  const actorId = (req as { user?: { id: number } }).user?.id;
  const prevStatus = normalizeMainOrderStatus(String(existingOrder.status));
  const nextStatus = normalizeMainOrderStatus(String(order.status));
  if (prevStatus !== nextStatus) {
    emitSafe("ORDER_STATUS_CHANGED", {
      orderId: id,
      orderNumber: order.orderNumber,
      branchId: order.branchId,
      previousStatus: prevStatus,
      nextStatus,
      changedById: actorId,
    });
  }
  const prevDel = normalizeDeliveryStatus((existingOrder as { deliveryStatus?: string }).deliveryStatus);
  const nextDel = normalizeDeliveryStatus((order as { deliveryStatus?: string }).deliveryStatus);
  if (prevDel !== nextDel) {
    emitSafe("ORDER_DELIVERY_UPDATED", {
      orderId: id,
      orderNumber: order.orderNumber,
      branchId: order.branchId,
      previousDeliveryStatus: prevDel,
      nextDeliveryStatus: nextDel,
      changedById: actorId,
    });
  }

  const nextAssigneeRows = await prisma.orderAssignee.findMany({
    where: { orderId: id },
    select: { userId: true },
  });
  const nextAssigneeKey =
    nextAssigneeRows.length > 0
      ? assigneeIdsKey(nextAssigneeRows.map((r) => r.userId))
      : order.assignedToId != null
        ? String(order.assignedToId)
        : "";
  const assigneesChanged = prevAssigneeKey !== nextAssigneeKey;
  if (orderHasNonWorkflowFieldChanges(existingOrder, order) || assigneesChanged) {
    emitSafe("ORDER_UPDATED", {
      orderId: id,
      orderNumber: order.orderNumber,
      branchId: order.branchId,
      updatedById: actorId,
    });
  }

  const prevStaffComments = parseStaffCommentsJson(existingOrder.staffComments);
  const nextStaffComments = parseStaffCommentsJson(order.staffComments);
  for (const row of findNewStaffComments(prevStaffComments, nextStaffComments)) {
    const preview = row.comment.slice(0, 240);
    emitSafe("ORDER_STAFF_COMMENT_ADDED", {
      orderId: id,
      orderNumber: order.orderNumber,
      branchId: order.branchId,
      commentPreview: preview,
      commentByName: row.authorName?.trim() || "Staff",
      addedById: actorId,
    });
  }

  res.json(await enrichOrder(order));
});

router.delete("/orders/:id", requireAuth, requirePermission("orders", "delete"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }
  const authUser = (req as { user?: { id: number; isSales?: boolean; ordersListScope?: string | null } }).user;
  if (!authUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const access = await assertOrderAccessibleBySalesScope(id, authUser);
  if (!access.ok) {
    res.status(access.status).json({ error: access.message });
    return;
  }
  try {
    const deleted = await deleteOrderWithDependents(id);
    if (!deleted) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete order";
    res.status(500).json({ error: msg });
  }
});

router.patch(
  "/orders/:id/delivery",
  requireAuth,
  requirePermissionAny([
    { module: "deliveries", action: "update" },
    { module: "orders", action: "update" },
  ]),
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    const parsed = PatchOrderDeliveryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const wantsStatus = parsed.data.deliveryStatus !== undefined;
    const wantsSlot = DELIVERY_SLOTS_ENABLED && parsed.data.deliverySlotId !== undefined;
    const wantsDriver = parsed.data.driverId !== undefined;
    if (!wantsStatus && !wantsSlot && !wantsDriver) {
      res.status(400).json({
        error: DELIVERY_SLOTS_ENABLED
          ? "Provide deliveryStatus, deliverySlotId, and/or driverId"
          : "Provide deliveryStatus and/or driverId",
      });
      return;
    }
    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    const authUser = (req as { user?: { id: number; isSales?: boolean; ordersListScope?: string | null } }).user;
    if (!authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const access = await assertOrderAccessibleBySalesScope(id, authUser);
    if (!access.ok) {
      res.status(access.status).json({ error: access.message });
      return;
    }
    if (wantsStatus) {
      const delAccess = await assertCanUpdateOrderDeliveryStatus(
        authUser as { id: number; role?: { name?: string | null } | null },
        id,
      );
      if (!delAccess.ok) {
        res.status(delAccess.status).json({ error: delAccess.message });
        return;
      }
    }
    const branchId = existing.branchId; 
    if (branchId == null) {
      res.status(400).json({ error: "Order has no branch" });
      return;
    }
    const eo = existing as any;
    const deliveryDate = existing.deliveryDate;
    const pincode = eo.customerPincode ?? null;

    let nextDriverId: number | null = eo.driverId ?? null;
    if (wantsDriver) {
      try {
        nextDriverId = await resolveDriverIdForOrder(parsed.data.driverId, branchId);
      } catch (e: unknown) {
        res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
        return;
      }
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        let nextSlotId = eo.deliverySlotId ?? null;
        if (DELIVERY_SLOTS_ENABLED && parsed.data.deliverySlotId !== undefined) {
          nextSlotId = parsed.data.deliverySlotId;
          if (nextSlotId != null && deliveryDate) {
            const v = await assertValidOrderDeliverySlot(tx, {
              branchId,
              deliverySlotId: nextSlotId,
              deliveryDate,
              pincode,
              excludeOrderId: id,
            });
            if (!v.ok) throw new Error(v.error);
          }
        }
        const nextDel =
          parsed.data.deliveryStatus !== undefined
            ? normalizeDeliveryStatus(parsed.data.deliveryStatus)
            : normalizeDeliveryStatus(eo.deliveryStatus);

        if (parsed.data.deliveryStatus !== undefined) {
          const t = assertDeliveryStatusTransition({
            mainStatus: normalizeMainOrderStatus(String(existing.status)),
            prevDelivery: normalizeDeliveryStatus(eo.deliveryStatus),
            nextDelivery: nextDel,
          });
          if (!t.ok) throw new Error(t.error);
        }
        const coh = assertOrderDeliveryCoherence(normalizeMainOrderStatus(String(existing.status)), nextDel);
        if (!coh.ok) throw new Error(coh.error);

        return tx.order.update({
          where: { id },
          data: {
            ...(DELIVERY_SLOTS_ENABLED && parsed.data.deliverySlotId !== undefined
              ? { deliverySlotId: nextSlotId }
              : {}),
            ...(parsed.data.deliveryStatus !== undefined ? { deliveryStatus: nextDel } : {}),
            ...(wantsDriver ? { driverId: nextDriverId } : {}),
          },
        });
      });
      const actorId = (req as { user?: { id: number } }).user?.id;
      if (parsed.data.deliveryStatus !== undefined) {
        const prevDel = normalizeDeliveryStatus(eo.deliveryStatus);
        const nextDel = normalizeDeliveryStatus(updated.deliveryStatus);
        if (prevDel !== nextDel) {
          emitSafe("ORDER_DELIVERY_UPDATED", {
            orderId: id,
            orderNumber: updated.orderNumber,
            branchId: updated.branchId,
            previousDeliveryStatus: prevDel,
            nextDeliveryStatus: nextDel,
            changedById: actorId,
          });
        }
      }
      res.json(await enrichOrder(updated));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(400).json({ error: msg || "Failed to update delivery" });
    }
  },
);

router.patch("/orders/:id/status", requireAuth, requirePermission("orders", "update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateOrderStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Order not found" }); return; }
  const authUser = (req as { user?: { id: number; isSales?: boolean; ordersListScope?: string | null } }).user;
  if (!authUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const access = await assertOrderAccessibleBySalesScope(id, authUser);
  if (!access.ok) {
    res.status(access.status).json({ error: access.message });
    return;
  }

  const body = parsed.data as Record<string, unknown>;
  const hasStatus = typeof body.status === "string";
  const hasPaymentStatus = typeof body.paymentStatus === "string";
  if (!hasStatus && !hasPaymentStatus) {
    res.status(400).json({ error: "Provide status and/or paymentStatus" });
    return;
  }

  let nextStatus = normalizeMainOrderStatus(String(existing.status));
  if (hasStatus) {
    const rawSt = body.status as string;
    const norm = rawSt === "delivered" ? "complete" : rawSt;
    nextStatus = ORDER_STATUSES.has(norm) ? norm : nextStatus;
    const eo = existing as { deliveryStatus?: string | null };
    const del = normalizeDeliveryStatus(eo.deliveryStatus);
    if (nextStatus !== "ready_to_ship" && del === "out_for_delivery") {
      res.status(400).json({
        error:
          "Delivery is Out for delivery. Set delivery to Pending or Delivered before changing order status away from Ready to ship.",
      });
      return;
    }
  }

  let nextPaymentStatus = (existing as { paymentStatus?: string | null }).paymentStatus ?? "due";
  if (hasPaymentStatus) {
    const ps = String(body.paymentStatus).trim();
    if (!PAYMENT_STATUSES.has(ps)) {
      res.status(400).json({ error: "Invalid payment status" });
      return;
    }
    nextPaymentStatus = ps;
  }

  const order = await prisma.order
    .update({
      where: { id },
      data: {
        ...(hasStatus ? { status: nextStatus } : {}),
        ...(hasPaymentStatus ? { paymentStatus: nextPaymentStatus } : {}),
      },
    })
    .catch(() => null);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  if (hasStatus) {
    const prevStatus = normalizeMainOrderStatus(String(existing.status));
    if (prevStatus !== nextStatus) {
      const actorId = (req as { user?: { id: number } }).user?.id;
      emitSafe("ORDER_STATUS_CHANGED", {
        orderId: id,
        orderNumber: order.orderNumber,
        branchId: order.branchId,
        previousStatus: prevStatus,
        nextStatus,
        changedById: actorId,
      });
    }
  }

  res.json(await enrichOrder(order));
});

router.patch("/orders/:id/payment-status", requireAuth, requirePermission("orders", "update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const paymentStatusRaw = typeof (req.body as { paymentStatus?: unknown })?.paymentStatus === "string"
    ? String((req.body as { paymentStatus: string }).paymentStatus).trim()
    : "";
  if (!PAYMENT_STATUSES.has(paymentStatusRaw)) {
    res.status(400).json({ error: "Invalid payment status" });
    return;
  }

  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Order not found" }); return; }

  const authUser = (req as { user?: { id: number; isSales?: boolean; ordersListScope?: string | null } }).user;
  if (!authUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const access = await assertOrderAccessibleBySalesScope(id, authUser);
  if (!access.ok) {
    res.status(access.status).json({ error: access.message });
    return;
  }

  const order = await prisma.order.update({
    where: { id },
    data: { paymentStatus: paymentStatusRaw },
  });
  res.json(await enrichOrder(order));
});

export default router;
