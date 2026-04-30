import { Router, IRouter } from "express";
import { AdjustInventoryBody } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma, toNumber } from "../lib/prisma";

const router: IRouter = Router();

router.get("/inventory/logs", requireAuth, requirePermission("inventory", "read"), async (req, res): Promise<void> => {
  const { productId, type, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let logs = await prisma.inventoryLog.findMany({ skip: offset, take: limitNum });
  if (productId) logs = logs.filter(l => l.productId === parseInt(productId, 10));
  if (type) logs = logs.filter(l => l.type === type);

  const productIds = [...new Set(logs.map(l => l.productId))];
  const products: Record<number, any> = {};
  for (const pid of productIds) {
    const p = await prisma.product.findUnique({ where: { id: pid } });
    if (p) products[p.id] = { ...p, price: toNumber(p.price), gstPercent: toNumber(p.gstPercent) };
  }

  const data = logs.map(l => ({ ...l, product: products[l.productId] || null }));
  res.json({ data, total: data.length, page: pageNum, limit: limitNum });
});

router.post("/inventory/adjust", requireAuth, requirePermission("inventory", "update"), async (req, res): Promise<void> => {
  const parsed = AdjustInventoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { productId, type, quantity, notes } = parsed.data;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  let newQty = product.stockQty;
  if (type === "in") newQty += quantity;
  else if (type === "out") newQty = Math.max(0, newQty - quantity);
  else newQty = quantity;

  await prisma.product.update({ where: { id: productId }, data: { stockQty: newQty } });

  const log = await prisma.inventoryLog.create({ data: { productId, type, quantity, notes } });
  res.json({ ...log, product: { ...product, price: toNumber(product.price), gstPercent: toNumber(product.gstPercent) } });
});

router.get("/inventory/low-stock", requireAuth, requirePermission("inventory", "read"), async (_req, res): Promise<void> => {
  const products = await prisma.product.findMany();
  const low = products
    .filter(p => p.stockQty <= p.lowStockThreshold)
    .map(p => ({ ...p, price: toNumber(p.price), gstPercent: toNumber(p.gstPercent) }));
  res.json(low);
});

export default router;
