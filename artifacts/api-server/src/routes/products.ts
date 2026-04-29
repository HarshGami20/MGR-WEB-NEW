import { Router, IRouter } from "express";
import { db, productsTable, categoriesTable } from "@workspace/db";
import { eq, lte } from "drizzle-orm";
import { CreateProductBody, UpdateProductBody, GetProductParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

async function enrichProduct(p: any) {
  let category = null;
  if (p.categoryId) {
    const [c] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, p.categoryId));
    if (c) category = { ...c, children: [] };
  }
  return {
    ...p,
    price: parseFloat(p.price),
    gstPercent: parseFloat(p.gstPercent),
    category,
  };
}

router.get("/products", requireAuth, async (req, res): Promise<void> => {
  const { search, categoryId, lowStock, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let products = await db.select().from(productsTable).offset(offset).limit(limitNum);
  if (search) products = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()));
  if (categoryId) products = products.filter(p => p.categoryId === parseInt(categoryId, 10));
  if (lowStock === "true") products = products.filter(p => p.stockQty <= p.lowStockThreshold);

  const data = await Promise.all(products.map(enrichProduct));
  res.json({ data, total: data.length, page: pageNum, limit: limitNum });
});

router.post("/products", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [product] = await db.insert(productsTable).values({
    ...parsed.data,
    price: String(parsed.data.price),
    gstPercent: String(parsed.data.gstPercent),
  }).returning();
  res.status(201).json(await enrichProduct(product));
});

router.get("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(await enrichProduct(product));
});

router.put("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [product] = await db.update(productsTable).set({
    ...parsed.data,
    price: String(parsed.data.price),
    gstPercent: String(parsed.data.gstPercent),
  }).where(eq(productsTable.id, id)).returning();
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(await enrichProduct(product));
});

router.delete("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [product] = await db.delete(productsTable).where(eq(productsTable.id, id)).returning();
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json({ success: true });
});

export default router;
