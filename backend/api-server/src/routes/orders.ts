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
import { requireWriteBranchId, resolveLogBranchId } from "../lib/branch-scope";
import { assignedBranchIds } from "../lib/user-branches";
import { decrementProductStock, incrementProductStock } from "../lib/product-stock";
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
  if (paidAmount <= 0) return "due";
  if (paidAmount >= totalAmount) return "paid";
  return "partially_paid";
}

function generateOrderNumber() {
  return `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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

async function enrichOrder(order: any) {
  const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
  const enrichedItems = await Promise.all(items.map(async (item) => {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    return {
      ...item,
      unitPrice: toNumber(item.unitPrice),
      gstPercent: toNumber(item.gstPercent),
      totalPrice: toNumber(item.totalPrice),
      product: product ? { ...product, price: toNumber(product.price), gstPercent: toNumber(product.gstPercent) } : null,
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
  if (order.deliverySlotId) {
    const ds = await prisma.deliverySlot.findUnique({ where: { id: order.deliverySlotId } });
    if (ds) deliverySlot = ds;
  }
  return {
    ...order,
    status: normalizeMainOrderStatus(order.status ?? "order_received"),
    paymentStatus: order.paymentStatus ?? "due",
    deliveryStatus: normalizeDeliveryStatus((order as { deliveryStatus?: string }).deliveryStatus),
    advanceAmount: toNumber(order.advanceAmount ?? 0),
    deliveryDate: order.deliveryDate ?? null,
    addressLat: order.addressLat != null ? toNumber(order.addressLat) : null,
    addressLng: order.addressLng != null ? toNumber(order.addressLng) : null,
    subtotal: toNumber(order.subtotal),
    taxAmount: toNumber(order.taxAmount),
    totalAmount: toNumber(order.totalAmount),
    paidAmount: toNumber(order.paidAmount),
    challanImages: safeJsonParse<string[]>(order.challanImages, []),
    photoComments: safeJsonParse<Array<{ imageUrl: string; comment?: string }>>(order.photoComments, []),
    staffComments: safeJsonParse<Array<{ comment: string; authorName?: string; createdAt: string }>>(order.staffComments, []),
    items: enrichedItems,
    branch,
    assignedTo,
    assignees,
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
  const { search, status, isGst, branchId, page = "1", limit = "20", assignmentScope } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const authUser = (req as { user?: { id: number } }).user;
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

  const clauses: any[] = [];
  if (search) {
    clauses.push({
      OR: [
        { customerName: { contains: search, mode: "insensitive" } },
        { orderNumber: { contains: search, mode: "insensitive" } },
      ],
    });
  }
  const scope = typeof assignmentScope === "string" ? assignmentScope : "all";
  if (scope === "created_by_me" && userId != null) {
    clauses.push({ createdById: userId });
  } else if (scope === "assigned_to_me" && userId != null) {
    clauses.push({
      OR: [{ assignedToId: userId }, { assignees: { some: { userId } } }],
    });
  }
  if (clauses.length === 1) {
    Object.assign(where, clauses[0]);
  } else if (clauses.length > 1) {
    where.AND = clauses;
  }

  const total = await prisma.order.count({ where });
  const orders = await prisma.order.findMany({ where, skip: offset, take: limitNum, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
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
      },
      orderBy: [{ name: "asc" }],
    });

    res.json({
      data: rows.map((u) => ({ id: u.id, name: u.name, mobile: u.mobile })),
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
    assignedToId: clientAssignedToId,
    ...orderData
  } = parsed.data as any;
  let subtotal = 0;
  let taxAmount = 0;

  const resolvedItems: any[] = [];
  for (const item of items) {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product) { res.status(400).json({ error: `Product ${item.productId} not found` }); return; }
      const gstPercent = orderData.isGst ? toNumber(product.gstPercent) : 0;
    const itemSubtotal = item.unitPrice * item.quantity;
    const itemTax = (itemSubtotal * gstPercent) / 100;
    subtotal += itemSubtotal;
    taxAmount += itemTax;
    resolvedItems.push({ ...item, gstPercent, totalPrice: itemSubtotal + itemTax });
  }

  const totalAmount = subtotal + taxAmount;
  const advanceAmount = Number(orderData.advanceAmount ?? 0);
  const safeAdvanceAmount = Number.isFinite(advanceAmount) ? Math.max(0, Math.min(totalAmount, advanceAmount)) : 0;
  const requestedStatusRaw = typeof orderData.status === "string" ? orderData.status : "order_received";
  const requestedStatus = requestedStatusRaw === "delivered" ? "complete" : requestedStatusRaw;
  const status = ORDER_STATUSES.has(requestedStatus) ? requestedStatus : "order_received";
  const requestedPaymentStatus = typeof orderData.paymentStatus === "string" ? orderData.paymentStatus : undefined;
  const paymentStatus = normalizePaymentStatus(totalAmount, safeAdvanceAmount, requestedPaymentStatus);
  const orderNumber = generateOrderNumber();

  const assigneeIdsFromBody = Array.isArray(inputAssigneeUserIds)
    ? normalizeAssigneeUserIds(inputAssigneeUserIds)
    : clientAssignedToId != null && Number.isFinite(Number(clientAssignedToId))
      ? [Number(clientAssignedToId)]
      : [];

  try {
    await assertActiveUserIdsExist(assigneeIdsFromBody);
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
      let resolvedDeliverySlotId: number | null =
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
          totalAmount: String(totalAmount),
          paidAmount: String(safeAdvanceAmount),
          challanImages: JSON.stringify(Array.isArray(orderData.challanImages) ? orderData.challanImages : []),
          photoComments: JSON.stringify(Array.isArray(orderData.photoComments) ? orderData.photoComments : []),
          staffComments: JSON.stringify(Array.isArray(orderData.staffComments) ? orderData.staffComments : []),
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

      for (const item of resolvedItems) {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: String(item.unitPrice),
            gstPercent: String(item.gstPercent),
            totalPrice: String(item.totalPrice),
          },
        });
        await decrementProductStock(item.productId, item.quantity, tx);
        await tx.inventoryLog.create({
          data: {
            productId: item.productId,
            type: "out",
            quantity: item.quantity,
            notes: `Order ${orderNumber}`,
            branchId,
          },
        });
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
        await tx.payment.create({
          data: {
            orderId: order.id,
            amount: String(safeAdvanceAmount),
            mode: orderData.paymentMode ?? "cash",
            notes: "Advance payment at order creation",
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

  const user = (req as { user?: { branchId: number | null; userBranches?: { branchId: number }[] } }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const logBranchId = await resolveLogBranchId(req, user, existingOrder.branchId);

  const existingItems = await prisma.orderItem.findMany({ where: { orderId: id } });
  const payload = parsed.data as any;

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
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: toNumber(item.unitPrice),
      }));

  let subtotal = 0;
  let taxAmount = 0;
  const resolvedItems: Array<{
    productId: number;
    quantity: number;
    unitPrice: number;
    gstPercent: number;
    totalPrice: number;
  }> = [];

  for (const item of nextItems) {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product) { res.status(400).json({ error: `Product ${item.productId} not found` }); return; }
    const gstPercent = nextIsGst ? toNumber(product.gstPercent) : 0;
    const itemSubtotal = item.unitPrice * item.quantity;
    const itemTax = (itemSubtotal * gstPercent) / 100;
    subtotal += itemSubtotal;
    taxAmount += itemTax;
    resolvedItems.push({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      gstPercent,
      totalPrice: itemSubtotal + itemTax,
    });
  }

  const totalAmount = subtotal + taxAmount;
  const currentPaidAmount = toNumber(existingOrder.paidAmount);
  const paymentStatus = normalizePaymentStatus(totalAmount, currentPaidAmount, payload.paymentStatus);

  const previousQtyByProduct = new Map<number, number>();
  for (const item of existingItems) {
    previousQtyByProduct.set(item.productId, (previousQtyByProduct.get(item.productId) ?? 0) + item.quantity);
  }
  const nextQtyByProduct = new Map<number, number>();
  for (const item of resolvedItems) {
    nextQtyByProduct.set(item.productId, (nextQtyByProduct.get(item.productId) ?? 0) + item.quantity);
  }
  const productIds = new Set<number>([...previousQtyByProduct.keys(), ...nextQtyByProduct.keys()]);

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      for (const productId of productIds) {
        const previousQty = previousQtyByProduct.get(productId) ?? 0;
        const nextQty = nextQtyByProduct.get(productId) ?? 0;
        const delta = nextQty - previousQty;
        if (delta === 0) continue;

        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product) throw new Error(`Product ${productId} not found while updating stock`);

        if (delta > 0) {
          await decrementProductStock(productId, delta, tx);
          await tx.inventoryLog.create({
            data: {
              productId,
              type: "out",
              quantity: delta,
              notes: `Order ${existingOrder.orderNumber} updated`,
              branchId: logBranchId,
            },
          });
        } else {
          const returnQty = Math.abs(delta);
          await incrementProductStock(productId, returnQty, tx);
          await tx.inventoryLog.create({
            data: {
              productId,
              type: "in",
              quantity: returnQty,
              notes: `Order ${existingOrder.orderNumber} updated (restock)`,
              branchId: logBranchId,
            },
          });
        }
      }

      await tx.orderItem.deleteMany({ where: { orderId: id } });
      await tx.orderItem.createMany({
        data: resolvedItems.map((item) => ({
          orderId: id,
          productId: item.productId,
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
        assignedToId: payloadAssignedToIdField,
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

      let nextSlotId: number | null;
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
      await tx.order.update({
        where: { id },
        data: {
          ...orderFields,
          branchId: nextOrderBranchId,
          status: safeStatus,
          paymentStatus,
          subtotal: String(subtotal),
          taxAmount: String(taxAmount),
          totalAmount: String(totalAmount),
          challanImages: JSON.stringify(normalizedChallanImages),
          photoComments: JSON.stringify(normalizedPhotoComments),
          staffComments: JSON.stringify(normalizedStaffComments),
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

  res.json(await enrichOrder(order));
});

router.delete("/orders/:id", requireAuth, requirePermission("orders", "delete"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const order = await prisma.order.delete({ where: { id } }).catch(() => null);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.json({ success: true });
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
    if (parsed.data.deliveryStatus === undefined && parsed.data.deliverySlotId === undefined) {
      res.status(400).json({ error: "Provide deliveryStatus and/or deliverySlotId" });
      return;
    }
    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    const branchId = existing.branchId;
    if (branchId == null) {
      res.status(400).json({ error: "Order has no branch" });
      return;
    }
    const eo = existing as any;
    const deliveryDate = existing.deliveryDate;
    const pincode = eo.customerPincode ?? null;

    try {
      const updated = await prisma.$transaction(async (tx) => {
        let nextSlotId = eo.deliverySlotId ?? null;
        if (parsed.data.deliverySlotId !== undefined) {
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
            ...(parsed.data.deliverySlotId !== undefined ? { deliverySlotId: nextSlotId } : {}),
            ...(parsed.data.deliveryStatus !== undefined ? { deliveryStatus: nextDel } : {}),
          },
        });
      });
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
  const rawSt = typeof (parsed.data as any).status === "string" ? (parsed.data as any).status : "order_received";
  const norm = rawSt === "delivered" ? "complete" : rawSt;
  const nextStatus = ORDER_STATUSES.has(norm) ? norm : "order_received";
  const eo = existing as any;
  const del = normalizeDeliveryStatus(eo.deliveryStatus);
  if (nextStatus !== "ready_to_ship" && del === "out_for_delivery") {
    res.status(400).json({
      error:
        "Delivery is Out for delivery. Set delivery to Pending or Delivered before changing order status away from Ready to ship.",
    });
    return;
  }
  const order = await prisma.order.update({ where: { id }, data: { status: nextStatus } }).catch(() => null);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(await enrichOrder(order));
});

export default router;
