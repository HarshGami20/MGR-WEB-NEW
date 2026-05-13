import type { Prisma } from "@prisma/client";
import { Router, IRouter } from "express";
import { CreatePurchaseOrderBody, UpdatePurchaseOrderBody, UpdatePurchaseOrderStatusBody, GetPurchaseOrderParams } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { prisma, toNumber } from "../lib/prisma";
import { incrementProductStock } from "../lib/product-stock";
import { getPartnerScope, purchaseOrderMatchesScope, PARTNER_ALLOWED_PO_STATUSES } from "../lib/partner-scope";
import { requirePermission } from "../lib/permissions";
import { requireWriteBranchId, resolveLogBranchId } from "../lib/branch-scope";

const router: IRouter = Router();

function generatePONumber() {
  return `PO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function enrichPO(po: any) {
  const items = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
  const enrichedItems = await Promise.all(items.map(async (item) => {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    return { ...item, unitPrice: toNumber(item.unitPrice), product: product ? { ...product, price: toNumber(product.price), gstPercent: toNumber(product.gstPercent) } : null };
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
  return { ...po, totalAmount: toNumber(po.totalAmount), items: enrichedItems, supplier, manufacturer, branch };
}

router.get("/purchase-orders", requireAuth, requirePermission("purchaseOrders", "read"), async (req, res): Promise<void> => {
  const { type, status, branchId, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const scope = await getPartnerScope(req);
  const where: Prisma.PurchaseOrderWhereInput = {};
  if (status) where.status = status;

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
  let totalAmount = 0;
  for (const item of items) totalAmount += item.unitPrice * item.quantity;
  const poNumber = generatePONumber();
  const po = await prisma.purchaseOrder.create({ data: {
    ...poData,
    branchId,
    poNumber,
    totalAmount: String(totalAmount),
    expectedDelivery: poData.expectedDelivery ? new Date(poData.expectedDelivery) : undefined,
  }});
  for (const item of items) {
    await prisma.purchaseOrderItem.create({ data: {
      purchaseOrderId: po.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: String(item.unitPrice),
    }});
  }
  res.status(201).json(await enrichPO(po));
});

router.get("/purchase-orders/:id", requireAuth, requirePermission("purchaseOrders", "read"), async (req, res): Promise<void> => {
  const params = GetPurchaseOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const po = await prisma.purchaseOrder.findUnique({ where: { id: params.data.id } });
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
  if (scope) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdatePurchaseOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: any = {};
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (parsed.data.expectedDelivery !== undefined) updateData.expectedDelivery = parsed.data.expectedDelivery ? new Date(parsed.data.expectedDelivery) : null;
  const po = await prisma.purchaseOrder.update({ where: { id }, data: updateData }).catch(() => null);
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }
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
  const po = await prisma.purchaseOrder.delete({ where: { id } }).catch(() => null);
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }
  res.json({ success: true });
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
  if (scope && !PARTNER_ALLOWED_PO_STATUSES.has(parsed.data.status)) {
    res.status(403).json({ error: "That status cannot be set from the supplier/manufacturer portal" });
    return;
  }
  const user = (req as { user?: { branchId: number | null } }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const logBranchId = await resolveLogBranchId(req, user, existing.branchId);
  try {
    const po = await prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: parsed.data.status } });
      const applyInbound = parsed.data.status === "delivered" && existing.status !== "delivered";
      if (applyInbound) {
        const items = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
        for (const item of items) {
          await incrementProductStock(item.productId, item.quantity, tx);
          await tx.inventoryLog.create({
            data: {
              productId: item.productId,
              type: "in",
              quantity: item.quantity,
              notes: `PO ${updated.poNumber} delivered`,
              branchId: logBranchId,
            },
          });
        }
      }
      return updated;
    });
    res.json(await enrichPO(po));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg });
  }
});

export default router;
