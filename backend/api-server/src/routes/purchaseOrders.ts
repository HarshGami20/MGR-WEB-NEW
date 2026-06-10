import type { Prisma } from "@prisma/client";
import { Router, IRouter } from "express";
import { CreatePurchaseOrderBody, UpdatePurchaseOrderBody, UpdatePurchaseOrderStatusBody } from "../zod";
import { emitSafe } from "../lib/app-events";
import {
  getPartnerScope,
  purchaseOrderMatchesScope,
  PARTNER_ALLOWED_PO_STATUSES,
} from "../lib/partner-scope";
import { requireAuth } from "../middlewares/auth";
import { createdAtRangeFromQuery } from "../lib/created-at-filter";
import { purchaseOrderHasProductInCategories, resolveCategoryFilterIds } from "../lib/category-filter";
import { prisma, toNumber } from "../lib/prisma";
import { decrementProductStock, incrementProductStock } from "../lib/product-stock";
import {
  isCustomLineItem,
  buildCustomAttributesJson,
  resolveCustomLineImages,
  normalizeLineDescription,
  type IncomingLineItem,
} from "../lib/custom-line-item";
import { parseImageUrlsJson } from "../lib/image-urls";
import { requirePermission } from "../lib/permissions";
import { requireWriteBranchId, resolveLogBranchId } from "../lib/branch-scope";

const router: IRouter = Router();

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

class PurchaseOrderDeleteBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseOrderDeleteBlockedError";
  }
}

/** Reverses inbound stock when a delivered PO is removed, then deletes the PO (items cascade). */
async function deletePurchaseOrderById(
  id: number,
  logBranchId: number | null,
  actorId: number | null,
): Promise<boolean> {
  const existing = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!existing) return false;

  await prisma.$transaction(async (tx) => {
    if (existing.status === "delivered") {
      for (const item of existing.items) {
        if (item.productId == null) continue;
        try {
          const movements = await decrementProductStock(item.productId, item.quantity, tx, item.variantId);
          if (logBranchId != null) {
            for (const movement of movements) {
              await tx.inventoryLog.create({
                data: {
                  productId: movement.productId,
                  variantId: movement.variantId,
                  type: "out",
                  quantity: movement.quantity,
                  notes: `PO ${existing.poNumber} deleted (stock reversed)`,
                  branchId: logBranchId,
                  userId: actorId,
                },
              });
            }
          }
        } catch {
          throw new PurchaseOrderDeleteBlockedError(
            `Cannot delete delivered PO ${existing.poNumber}: not enough stock to reverse inbound quantities. Adjust stock first.`,
          );
        }
      }
    }
    await tx.purchaseOrder.delete({ where: { id } });
  });

  return true;
}

function generatePONumber() {
  return `PO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

const NON_EDITABLE_PO_STATUSES = new Set(["delivered", "cancelled"]);

type PoItemWriter = {
  purchaseOrderItem: {
    create: (args: {
      data: {
        purchaseOrderId: number;
        isCustom: boolean;
        productId: number | null;
        variantId: number | null;
        customName?: string | null;
        customImageUrl?: string | null;
        customImageUrls?: string | null;
        customAttributes?: string | null;
        description?: string | null;
        quantity: number;
        unitPrice: string;
      };
    }) => Promise<unknown>;
  };
};

async function writePurchaseOrderItems(
  writer: PoItemWriter,
  poId: number,
  items: IncomingLineItem[],
): Promise<number> {
  let totalAmount = 0;
  for (const raw of items) {
    const custom = isCustomLineItem(raw);
    if (custom) {
      const name = raw.customName?.trim();
      if (!name) throw new Error("Custom line item name is required");
      const imgs = resolveCustomLineImages(raw);
      await writer.purchaseOrderItem.create({
        data: {
          purchaseOrderId: poId,
          isCustom: true,
          productId: null,
          variantId: null,
          customName: name,
          customImageUrl: imgs.customImageUrl,
          customImageUrls: imgs.customImageUrls,
          customAttributes: buildCustomAttributesJson(raw),
          description: normalizeLineDescription(raw.description),
          quantity: raw.quantity,
          unitPrice: String(raw.unitPrice),
        },
      });
      totalAmount += raw.unitPrice * raw.quantity;
      continue;
    }
    const productId = Number(raw.productId);
    if (!productId) throw new Error("Product is required for catalog line items");
    const variantId =
      raw.variantId != null && Number.isFinite(Number(raw.variantId)) && Number(raw.variantId) > 0
        ? Number(raw.variantId)
        : null;
    await writer.purchaseOrderItem.create({
      data: {
        purchaseOrderId: poId,
        isCustom: false,
        productId,
        variantId,
        description: normalizeLineDescription(raw.description),
        quantity: raw.quantity,
        unitPrice: String(raw.unitPrice),
      },
    });
    totalAmount += raw.unitPrice * raw.quantity;
  }
  return totalAmount;
}

function todayYmdLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function expectedDeliveryYmd(value: unknown): string | null {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (match) return match[1]!;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function expectedDeliveryInPast(value: unknown): boolean {
  const ymd = expectedDeliveryYmd(value);
  return Boolean(ymd && ymd < todayYmdLocal());
}

async function enrichPO(po: any) {
  const items = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
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
      product: product
        ? { ...product, price: toNumber(product.price), gstPercent: toNumber(product.gstPercent) }
        : null,
      variant: variant
        ? {
            ...variant,
            price: variant.price != null ? toNumber(variant.price) : null,
          }
        : null,
    };
  }));
  let supplier: Awaited<ReturnType<typeof prisma.supplier.findUnique>> = null;
  let manufacturer: Awaited<ReturnType<typeof prisma.manufacturer.findUnique>> = null;
  if (po.supplierId) {
    const s = await prisma.supplier.findUnique({ where: { id: po.supplierId } });
    supplier = s ?? null;
  }
  if (po.manufacturerId) {
    const m = await prisma.manufacturer.findUnique({ where: { id: po.manufacturerId } });
    manufacturer = m ?? null;
  }
  let branch: Awaited<ReturnType<typeof prisma.branch.findUnique>> = null;
  if (po.branchId) {
    const b = await prisma.branch.findUnique({ where: { id: po.branchId } });
    if (b) branch = b;
  }
  return {
    ...po,
    totalAmount: toNumber(po.totalAmount),
    items: enrichedItems,
    supplier,
    manufacturer,
    branch,
    staffComments: safeJsonParse<Array<{ comment: string; authorName?: string; createdAt: string }>>(
      po.staffComments,
      [],
    ),
  };
}

router.get("/purchase-orders", requireAuth, requirePermission("purchaseOrders", "read"), async (req, res): Promise<void> => {
  const { type, status, branchId, page = "1", limit = "20", openOnly, createdFrom, createdTo, categoryId, search } =
    req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const scope = await getPartnerScope(req);
  const where: Prisma.PurchaseOrderWhereInput = {};
  if (openOnly === "true" || openOnly === "1") {
    where.status = { in: ["pending", "confirmed", "in_production", "shipped"] };
  } else if (status) {
    where.status = status;
  }

  if (scope?.kind === "supplier") {
    if (type && type !== "supplier") {
      res.json({ data: [], total: 0, page: pageNum, limit: limitNum });
      return;
    }
    where.supplierId = scope.supplierId;
    where.type = "supplier";
  } else if (scope?.kind === "manufacturer") {
    if (type && type !== "manufacturer") {
      res.json({ data: [], total: 0, page: pageNum, limit: limitNum });
      return;
    }
    where.manufacturerId = scope.manufacturerId;
    where.type = "manufacturer";
  } else {
    if (type) where.type = type;
    if (branchId) where.branchId = parseInt(branchId, 10);
  }

  const createdAt = createdAtRangeFromQuery(createdFrom, createdTo);
  if (createdAt) where.createdAt = createdAt;

  const extraClauses: Prisma.PurchaseOrderWhereInput[] = [];

  const categoryIds = await resolveCategoryFilterIds(categoryId);
  if (categoryIds) {
    extraClauses.push(purchaseOrderHasProductInCategories(categoryIds));
  }

  const q = typeof search === "string" ? search.trim() : "";
  if (q) {
    extraClauses.push({
      poNumber: { contains: q, mode: "insensitive" },
    });
  }

  if (extraClauses.length === 1) {
    Object.assign(where, extraClauses[0]);
  } else if (extraClauses.length > 1) {
    where.AND = extraClauses;
  }

  const [totalCount, pos] = await prisma.$transaction([
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.findMany({
      where,
      skip: offset,
      take: limitNum,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const data = await Promise.all(pos.map(enrichPO));
  res.json({ data, total: totalCount, page: pageNum, limit: limitNum });
});

router.post("/purchase-orders", requireAuth, requirePermission("purchaseOrders", "create"), async (req, res): Promise<void> => {
  const scope = await getPartnerScope(req);
  if (scope) {
    res.status(403).json({ error: "Portal users cannot create purchase orders" });
    return;
  }
  const parsed = CreatePurchaseOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const user = (req as { user?: { branchId: number | null } }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const branchId = await requireWriteBranchId(req, res, user);
  if (branchId == null) return;

  const { items, branchId: _omitClientBranch, ...poData } = parsed.data as any;
  if (expectedDeliveryInPast(poData.expectedDelivery)) {
    res.status(400).json({ error: "Expected delivery date cannot be in the past" });
    return;
  }
  const poNumber = generatePONumber();
  const actorId = (req as { user?: { id: number } }).user?.id;
  let po: Awaited<ReturnType<typeof prisma.purchaseOrder.create>>;
  try {
    po = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({
        data: {
          ...poData,
          branchId,
          poNumber,
          totalAmount: "0",
          createdById: actorId ?? null,
          expectedDelivery: poData.expectedDelivery ? new Date(poData.expectedDelivery) : undefined,
        },
      });
      const totalAmount = await writePurchaseOrderItems(tx, created.id, items as IncomingLineItem[]);
      return tx.purchaseOrder.update({
        where: { id: created.id },
        data: { totalAmount: String(totalAmount) },
      });
    });
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    return;
  }
  emitSafe("PURCHASE_ORDER_CREATED", {
    purchaseOrderId: po.id,
    poNumber: po.poNumber,
    branchId: po.branchId,
    supplierId: po.supplierId,
    manufacturerId: po.manufacturerId,
    type: po.type,
    createdById: actorId,
  });
  res.status(201).json(await enrichPO(po));
});

router.get("/purchase-orders/:id", requireAuth, requirePermission("purchaseOrders", "read"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(raw), 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid purchase order id" });
    return;
  }
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }
  const scope = await getPartnerScope(req);
  if (!purchaseOrderMatchesScope(po, scope)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(await enrichPO(po));
});

router.put("/purchase-orders/:id", requireAuth, requirePermission("purchaseOrders", "update"), async (req, res): Promise<void> => {
  const scope = await getPartnerScope(req);
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdatePurchaseOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Purchase order not found" }); return; }
  if (!purchaseOrderMatchesScope(existing, scope)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (scope) {
    if (parsed.data.staffComments === undefined || parsed.data.notes !== undefined || parsed.data.expectedDelivery !== undefined) {
      res.status(403).json({ error: "Partners may only add notes on this order" });
      return;
    }
    const normalized = Array.isArray(parsed.data.staffComments) ? parsed.data.staffComments : [];
    const po = await prisma.purchaseOrder.update({
      where: { id },
      data: { staffComments: JSON.stringify(normalized) },
    }).catch(() => null);
    if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }
    const actorId = (req as { user?: { id: number } }).user?.id;
    emitSafe("PURCHASE_ORDER_UPDATED", {
      purchaseOrderId: po.id,
      poNumber: po.poNumber,
      branchId: po.branchId,
      supplierId: po.supplierId,
      manufacturerId: po.manufacturerId,
      type: po.type,
      updatedById: actorId,
    });
    res.json(await enrichPO(po));
    return;
  }

  const payload = parsed.data as {
    notes?: string | null;
    expectedDelivery?: string | null;
    staffComments?: unknown;
    type?: string;
    supplierId?: number | null;
    manufacturerId?: number | null;
    items?: IncomingLineItem[];
  };

  const structuralChange =
    payload.items !== undefined ||
    payload.type !== undefined ||
    payload.supplierId !== undefined ||
    payload.manufacturerId !== undefined;
  if (structuralChange && NON_EDITABLE_PO_STATUSES.has(existing.status)) {
    res.status(409).json({
      error: "Cannot edit line items, vendor, or type on delivered or cancelled purchase orders",
    });
    return;
  }

  const nextType = payload.type ?? existing.type;
  if (payload.type !== undefined && !["supplier", "manufacturer"].includes(String(payload.type))) {
    res.status(400).json({ error: "Invalid purchase order type" });
    return;
  }
  const nextSupplierId =
    payload.supplierId !== undefined ? payload.supplierId : existing.supplierId;
  const nextManufacturerId =
    payload.manufacturerId !== undefined ? payload.manufacturerId : existing.manufacturerId;
  if (nextType === "supplier" && !nextSupplierId) {
    res.status(400).json({ error: "Supplier is required for supplier purchase orders" });
    return;
  }
  if (nextType === "manufacturer" && !nextManufacturerId) {
    res.status(400).json({ error: "Manufacturer is required for manufacturer purchase orders" });
    return;
  }

  const updateData: Prisma.PurchaseOrderUpdateInput = {};
  if (payload.notes !== undefined) updateData.notes = payload.notes;
  if (payload.expectedDelivery !== undefined) {
    if (expectedDeliveryInPast(payload.expectedDelivery)) {
      res.status(400).json({ error: "Expected delivery date cannot be in the past" });
      return;
    }
    updateData.expectedDelivery = payload.expectedDelivery ? new Date(payload.expectedDelivery) : null;
  }
  if (payload.staffComments !== undefined) {
    const normalized = Array.isArray(payload.staffComments) ? payload.staffComments : [];
    updateData.staffComments = JSON.stringify(normalized);
  }
  if (payload.type !== undefined) updateData.type = payload.type;
  if (payload.supplierId !== undefined || payload.type !== undefined) {
    updateData.supplier = nextType === "supplier" && nextSupplierId
      ? { connect: { id: nextSupplierId } }
      : { disconnect: true };
  }
  if (payload.manufacturerId !== undefined || payload.type !== undefined) {
    updateData.manufacturer = nextType === "manufacturer" && nextManufacturerId
      ? { connect: { id: nextManufacturerId } }
      : { disconnect: true };
  }

  let po: Awaited<ReturnType<typeof prisma.purchaseOrder.update>> | null = null;
  try {
    po = await prisma.$transaction(async (tx) => {
      if (payload.items !== undefined) {
        const items = Array.isArray(payload.items) ? payload.items : [];
        if (items.length === 0) throw new Error("At least one line item is required");
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
        const totalAmount = await writePurchaseOrderItems(tx, id, items);
        updateData.totalAmount = String(totalAmount);
      }
      return tx.purchaseOrder.update({ where: { id }, data: updateData });
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("not found")) {
      res.status(404).json({ error: "Purchase order not found" });
      return;
    }
    res.status(400).json({ error: msg });
    return;
  }
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }

  const hasChanges =
    structuralChange ||
    (payload.notes !== undefined && payload.notes !== existing.notes) ||
    (payload.expectedDelivery !== undefined &&
      String(payload.expectedDelivery ?? "") !==
        (existing.expectedDelivery ? existing.expectedDelivery.toISOString() : "")) ||
    (payload.staffComments !== undefined &&
      JSON.stringify(payload.staffComments ?? []) !== (existing.staffComments ?? "[]"));

  if (hasChanges) {
    const actorId = (req as { user?: { id: number } }).user?.id;
    emitSafe("PURCHASE_ORDER_UPDATED", {
      purchaseOrderId: po.id,
      poNumber: po.poNumber,
      branchId: po.branchId,
      supplierId: po.supplierId,
      manufacturerId: po.manufacturerId,
      type: po.type,
      updatedById: actorId,
    });
  }

  res.json(await enrichPO(po));
});

router.delete("/purchase-orders/:id", requireAuth, requirePermission("purchaseOrders", "delete"), async (req, res): Promise<void> => {
  const scope = await getPartnerScope(req);
  if (scope) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid purchase order id" });
    return;
  }

  const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Purchase order not found" });
    return;
  }

  const user = (req as { user?: { id: number; branchId: number | null } }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const logBranchId = await resolveLogBranchId(req, user, existing.branchId);

  try {
    const deleted = await deletePurchaseOrderById(id, logBranchId, user.id);
    if (!deleted) {
      res.status(404).json({ error: "Purchase order not found" });
      return;
    }
    res.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof PurchaseOrderDeleteBlockedError) {
      res.status(409).json({ error: e.message });
      return;
    }
    const msg = e instanceof Error ? e.message : "Failed to delete purchase order";
    res.status(500).json({ error: msg });
  }
});

router.patch("/purchase-orders/:id/status", requireAuth, requirePermission("purchaseOrders", "update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdatePurchaseOrderStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const scope = await getPartnerScope(req);
  const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Purchase order not found" }); return; }
  if (!purchaseOrderMatchesScope(existing, scope)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const nextStatus = String(parsed.data.status ?? "");
  const supplierReject =
    scope?.kind === "supplier" &&
    nextStatus === "cancelled" &&
    ["pending", "confirmed"].includes(existing.status);
  if (scope && !supplierReject && !PARTNER_ALLOWED_PO_STATUSES.has(nextStatus)) {
    res.status(403).json({ error: "That status cannot be set from the supplier/manufacturer portal" });
    return;
  }
  const user = (req as { user?: { id: number; branchId: number | null } }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const logBranchId = await resolveLogBranchId(req, user, existing.branchId);
  const actorId = user.id;
  try {
    const po = await prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: parsed.data.status } });
      const applyInbound = parsed.data.status === "delivered" && existing.status !== "delivered";
      if (applyInbound) {
        const items = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
        for (const item of items) {
          if (item.productId == null) continue;
          const movements = await incrementProductStock(item.productId, item.quantity, tx, item.variantId);
          for (const movement of movements) {
            await tx.inventoryLog.create({
              data: {
                productId: movement.productId,
                variantId: movement.variantId,
                type: "in",
                quantity: movement.quantity,
                notes: `PO ${updated.poNumber} delivered`,
                branchId: logBranchId,
                userId: actorId,
              },
            });
          }
        }
      }
      return updated;
    });
    if (existing.status !== po.status) {
      emitSafe("PURCHASE_ORDER_STATUS_CHANGED", {
        purchaseOrderId: po.id,
        poNumber: po.poNumber,
        branchId: po.branchId,
        supplierId: po.supplierId,
        manufacturerId: po.manufacturerId,
        type: po.type,
        previousStatus: existing.status,
        nextStatus: po.status,
        changedById: actorId,
        changedByPartner: Boolean(scope),
      });
    }
    res.json(await enrichPO(po));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg });
  }
});

export default router;
