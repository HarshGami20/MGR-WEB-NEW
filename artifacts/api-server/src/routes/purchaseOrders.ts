import { Router, IRouter } from "express";
import { db, purchaseOrdersTable, purchaseOrderItemsTable, productsTable, suppliersTable, manufacturersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreatePurchaseOrderBody, UpdatePurchaseOrderBody, UpdatePurchaseOrderStatusBody, GetPurchaseOrderParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { inventoryLogsTable } from "@workspace/db";

const router: IRouter = Router();

function generatePONumber() {
  return `PO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function enrichPO(po: any) {
  const items = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.purchaseOrderId, po.id));
  const enrichedItems = await Promise.all(items.map(async (item) => {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    return { ...item, unitPrice: parseFloat(item.unitPrice), product: product ? { ...product, price: parseFloat(product.price), gstPercent: parseFloat(product.gstPercent) } : null };
  }));
  let supplier = null, manufacturer = null;
  if (po.supplierId) {
    const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, po.supplierId));
    supplier = s || null;
  }
  if (po.manufacturerId) {
    const [m] = await db.select().from(manufacturersTable).where(eq(manufacturersTable.id, po.manufacturerId));
    manufacturer = m || null;
  }
  return { ...po, totalAmount: parseFloat(po.totalAmount), items: enrichedItems, supplier, manufacturer };
}

router.get("/purchase-orders", requireAuth, async (req, res): Promise<void> => {
  const { type, status, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;
  let pos = await db.select().from(purchaseOrdersTable).offset(offset).limit(limitNum);
  if (type) pos = pos.filter(p => p.type === type);
  if (status) pos = pos.filter(p => p.status === status);
  const data = await Promise.all(pos.map(enrichPO));
  res.json({ data, total: data.length, page: pageNum, limit: limitNum });
});

router.post("/purchase-orders", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePurchaseOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { items, ...poData } = parsed.data;
  let totalAmount = 0;
  for (const item of items) totalAmount += item.unitPrice * item.quantity;
  const poNumber = generatePONumber();
  const [po] = await db.insert(purchaseOrdersTable).values({
    ...poData,
    poNumber,
    totalAmount: String(totalAmount),
    expectedDelivery: poData.expectedDelivery ? new Date(poData.expectedDelivery) : undefined,
  }).returning();
  for (const item of items) {
    await db.insert(purchaseOrderItemsTable).values({
      purchaseOrderId: po.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: String(item.unitPrice),
    });
  }
  res.status(201).json(await enrichPO(po));
});

router.get("/purchase-orders/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetPurchaseOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, params.data.id));
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }
  res.json(await enrichPO(po));
});

router.put("/purchase-orders/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdatePurchaseOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: any = {};
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (parsed.data.expectedDelivery !== undefined) updateData.expectedDelivery = parsed.data.expectedDelivery ? new Date(parsed.data.expectedDelivery) : null;
  const [po] = await db.update(purchaseOrdersTable).set(updateData).where(eq(purchaseOrdersTable.id, id)).returning();
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }
  res.json(await enrichPO(po));
});

router.delete("/purchase-orders/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [po] = await db.delete(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id)).returning();
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }
  res.json({ success: true });
});

router.patch("/purchase-orders/:id/status", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdatePurchaseOrderStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [po] = await db.update(purchaseOrdersTable).set({ status: parsed.data.status }).where(eq(purchaseOrdersTable.id, id)).returning();
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }

  // Auto-increase stock on delivery
  if (parsed.data.status === "delivered") {
    const items = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.purchaseOrderId, id));
    for (const item of items) {
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
      if (product) {
        await db.update(productsTable).set({ stockQty: product.stockQty + item.quantity }).where(eq(productsTable.id, item.productId));
        await db.insert(inventoryLogsTable).values({ productId: item.productId, type: "in", quantity: item.quantity, notes: `PO ${po.poNumber} delivered` });
      }
    }
  }
  res.json(await enrichPO(po));
});

export default router;
