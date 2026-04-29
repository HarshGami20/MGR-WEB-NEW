import { Router, IRouter } from "express";
import { db, productVariantsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { CreateProductVariantBody, UpdateProductVariantBody } from "@workspace/api-zod";

const router: IRouter = Router();

function serializeVariant(v: any) {
  return {
    ...v,
    price: v.price != null ? parseFloat(v.price) : null,
  };
}

router.get("/products/:productId/variants", requireAuth, async (req, res): Promise<void> => {
  const productId = parseInt(req.params.productId, 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid productId" }); return; }
  const variants = await db.select().from(productVariantsTable).where(eq(productVariantsTable.productId, productId));
  res.json(variants.map(serializeVariant));
});

router.post("/products/:productId/variants", requireAuth, async (req, res): Promise<void> => {
  const productId = parseInt(req.params.productId, 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid productId" }); return; }
  const parsed = CreateProductVariantBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [variant] = await db.insert(productVariantsTable).values({
      productId,
      name: parsed.data.name,
      sku: parsed.data.sku,
      price: parsed.data.price != null ? String(parsed.data.price) : null,
      stockQty: parsed.data.stockQty ?? 0,
      attributes: parsed.data.attributes ?? null,
      isActive: parsed.data.isActive ?? true,
    }).returning();
    res.status(201).json(serializeVariant(variant));
  } catch (e: any) {
    if (e.code === "23505") {
      res.status(409).json({ error: "SKU already exists" });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

router.patch("/products/:productId/variants/:variantId", requireAuth, async (req, res): Promise<void> => {
  const productId = parseInt(req.params.productId, 10);
  const variantId = parseInt(req.params.variantId, 10);
  if (isNaN(productId) || isNaN(variantId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateProductVariantBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: any = { ...parsed.data };
  if ("price" in updateData && updateData.price != null) {
    updateData.price = String(updateData.price);
  }
  try {
    const [variant] = await db.update(productVariantsTable)
      .set(updateData)
      .where(and(eq(productVariantsTable.id, variantId), eq(productVariantsTable.productId, productId)))
      .returning();
    if (!variant) { res.status(404).json({ error: "Variant not found" }); return; }
    res.json(serializeVariant(variant));
  } catch (e: any) {
    if (e.code === "23505") {
      res.status(409).json({ error: "SKU already exists" });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

router.delete("/products/:productId/variants/:variantId", requireAuth, async (req, res): Promise<void> => {
  const productId = parseInt(req.params.productId, 10);
  const variantId = parseInt(req.params.variantId, 10);
  if (isNaN(productId) || isNaN(variantId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [variant] = await db.delete(productVariantsTable)
    .where(and(eq(productVariantsTable.id, variantId), eq(productVariantsTable.productId, productId)))
    .returning();
  if (!variant) { res.status(404).json({ error: "Variant not found" }); return; }
  res.json({ success: true });
});

export default router;
