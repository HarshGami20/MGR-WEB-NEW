import { Router, IRouter } from "express";
import { CreateProductBody, UpdateProductBody, GetProductParams } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma, toNumber } from "../lib/prisma";

const router: IRouter = Router();

async function enrichProduct(p: any) {
  let category = null;
  if (p.categoryId) {
    const c = await prisma.category.findUnique({ where: { id: p.categoryId } });
    if (c) category = { ...c, children: [] };
  }
  return {
    ...p,
    price: toNumber(p.price),
    gstPercent: toNumber(p.gstPercent),
    category,
  };
}

router.get("/products", requireAuth, requirePermission("products", "read"), async (req, res): Promise<void> => {
  const { search, categoryId, lowStock, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let products = await prisma.product.findMany({ skip: offset, take: limitNum });
  if (search) products = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()));
  if (categoryId) products = products.filter(p => p.categoryId === parseInt(categoryId, 10));
  if (lowStock === "true") products = products.filter(p => p.stockQty <= p.lowStockThreshold);

  const data = await Promise.all(products.map(enrichProduct));
  res.json({ data, total: data.length, page: pageNum, limit: limitNum });
});

router.post("/products", requireAuth, requirePermission("products", "create"), async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const product = await prisma.product.create({ data: {
    ...parsed.data,
    price: String(parsed.data.price),
    gstPercent: String(parsed.data.gstPercent),
  }});
  res.status(201).json(await enrichProduct(product));
});

router.get("/products/:id", requireAuth, requirePermission("products", "read"), async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const product = await prisma.product.findUnique({ where: { id: params.data.id } });
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(await enrichProduct(product));
});

router.put("/products/:id", requireAuth, requirePermission("products", "update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const product = await prisma.product.update({ where: { id }, data: {
    ...parsed.data,
    price: String(parsed.data.price),
    gstPercent: String(parsed.data.gstPercent),
  }}).catch(() => null);
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(await enrichProduct(product));
});

router.delete("/products/:id", requireAuth, requirePermission("products", "delete"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const product = await prisma.product.delete({ where: { id } }).catch(() => null);
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json({ success: true });
});

export default router;
