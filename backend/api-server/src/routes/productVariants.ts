import { Router, IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { CreateProductVariantBody, UpdateProductVariantBody } from "../zod";
import { prisma, toNumber } from "../lib/prisma";

const router: IRouter = Router();

function serializeVariant(v: any) {
  return {
    ...v,
    price: v.price != null ? toNumber(v.price) : null,
  };
}

router.get("/products/:productId/variants", requireAuth, requirePermission("products", "read"), async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.productId), 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid productId" }); return; }
  const variants = await prisma.productVariant.findMany({ where: { productId } });
  res.json(variants.map(serializeVariant));
});

router.post("/products/:productId/variants", requireAuth, requirePermission("products", "create"), async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.productId), 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid productId" }); return; }
  const parsed = CreateProductVariantBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const variant = await prisma.productVariant.create({ data: {
      productId,
      name: parsed.data.name,
      sku: parsed.data.sku,
      price: parsed.data.price != null ? String(parsed.data.price) : null,
      stockQty: parsed.data.stockQty ?? 0,
      attributes: parsed.data.attributes ?? null,
      isActive: parsed.data.isActive ?? true,
    }});
    res.status(201).json(serializeVariant(variant));
  } catch (e: any) {
    if (e.code === "23505") {
      res.status(409).json({ error: "SKU already exists" });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

router.patch("/products/:productId/variants/:variantId", requireAuth, requirePermission("products", "update"), async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.productId), 10);
  const variantId = parseInt(String(req.params.variantId), 10);
  if (isNaN(productId) || isNaN(variantId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateProductVariantBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: any = { ...parsed.data };
  if ("price" in updateData && updateData.price != null) {
    updateData.price = String(updateData.price);
  }
  try {
    const variant = await prisma.productVariant.update({
      where: { id: variantId },
      data: updateData,
    }).catch(() => null);
    if (variant && variant.productId !== productId) {
      res.status(404).json({ error: "Variant not found" });
      return;
    }
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

router.delete("/products/:productId/variants/:variantId", requireAuth, requirePermission("products", "delete"), async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.productId), 10);
  const variantId = parseInt(String(req.params.variantId), 10);
  if (isNaN(productId) || isNaN(variantId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!variant || variant.productId !== productId) { res.status(404).json({ error: "Variant not found" }); return; }
  await prisma.productVariant.delete({ where: { id: variantId } });
  if (!variant) { res.status(404).json({ error: "Variant not found" }); return; }
  res.json({ success: true });
});

export default router;
