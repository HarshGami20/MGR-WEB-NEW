import { Router, IRouter } from "express";
import { db, inventoryLogsTable, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { AdjustInventoryBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/inventory/logs", requireAuth, async (req, res): Promise<void> => {
  const { productId, type, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let logs = await db.select().from(inventoryLogsTable).offset(offset).limit(limitNum);
  if (productId) logs = logs.filter(l => l.productId === parseInt(productId, 10));
  if (type) logs = logs.filter(l => l.type === type);

  const productIds = [...new Set(logs.map(l => l.productId))];
  const products: Record<number, any> = {};
  for (const pid of productIds) {
    const [p] = await db.select().from(productsTable).where(eq(productsTable.id, pid));
    if (p) products[p.id] = { ...p, price: parseFloat(p.price), gstPercent: parseFloat(p.gstPercent) };
  }

  const data = logs.map(l => ({ ...l, product: products[l.productId] || null }));
  res.json({ data, total: data.length, page: pageNum, limit: limitNum });
});

router.post("/inventory/adjust", requireAuth, async (req, res): Promise<void> => {
  const parsed = AdjustInventoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { productId, type, quantity, notes } = parsed.data;

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  let newQty = product.stockQty;
  if (type === "in") newQty += quantity;
  else if (type === "out") newQty = Math.max(0, newQty - quantity);
  else newQty = quantity;

  await db.update(productsTable).set({ stockQty: newQty }).where(eq(productsTable.id, productId));

  const [log] = await db.insert(inventoryLogsTable).values({ productId, type, quantity, notes }).returning();
  res.json({ ...log, product: { ...product, price: parseFloat(product.price), gstPercent: parseFloat(product.gstPercent) } });
});

router.get("/inventory/low-stock", requireAuth, async (_req, res): Promise<void> => {
  const products = await db.select().from(productsTable);
  const low = products
    .filter(p => p.stockQty <= p.lowStockThreshold)
    .map(p => ({ ...p, price: parseFloat(p.price), gstPercent: parseFloat(p.gstPercent) }));
  res.json(low);
});

export default router;
