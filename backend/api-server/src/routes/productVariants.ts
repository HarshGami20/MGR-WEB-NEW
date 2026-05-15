import { Router, IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { CreateProductVariantBody, UpdateProductVariantBody } from "../zod";
import { prisma, toNumber } from "../lib/prisma";
import { syncProductStockFromVariants } from "../lib/product-stock";
import { syncAttributeCatalogFromJson } from "../lib/attribute-catalog";
import { requireWriteBranchId } from "../lib/branch-scope";

const router: IRouter = Router();

function serializeVariant(v: any) {
  const { ...rest } = v;
  return {
    ...rest,
    price: v.price != null ? toNumber(v.price) : null,
  };
}

router.get("/products/:productId/variants", requireAuth, requirePermission("products", "read"), async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.productId), 10);
  if (Number.isNaN(productId)) {
    res.status(400).json({ error: "Invalid productId" });
    return;
  }
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const variants = await prisma.productVariant.findMany({
    where: { productId },
    orderBy: { id: "asc" },
  });
  res.json(variants.map(serializeVariant));
});

router.post("/products/:productId/variants", requireAuth, requirePermission("products", "create"), async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.productId), 10);
  if (Number.isNaN(productId)) {
    res.status(400).json({ error: "Invalid productId" });
    return;
  }
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const parsed = CreateProductVariantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = (req as { user?: { branchId: number | null } }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const writeBranchId = await requireWriteBranchId(req, res, user);
  if (writeBranchId == null) return;
  try {
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        name: parsed.data.name,
        sku: parsed.data.sku,
        imageUrl: parsed.data.imageUrl ?? null,
        price: parsed.data.price != null ? String(parsed.data.price) : null,
        stockQty: parsed.data.stockQty ?? 0,
        lowStockThreshold: parsed.data.lowStockThreshold ?? 10,
        attributes: parsed.data.attributes ?? null,
        isActive: parsed.data.isActive ?? true,
      },
    });
    if ((parsed.data.stockQty ?? 0) > 0) {
      await prisma.inventoryLog.create({
        data: {
          productId,
          variantId: variant.id,
          type: "in",
          quantity: parsed.data.stockQty ?? 0,
          notes: `Initial stock for variant ${variant.name}`,
          branchId: writeBranchId,
        },
      });
    }
    await syncAttributeCatalogFromJson(parsed.data.attributes ?? null);
    await syncProductStockFromVariants(productId);
    res.status(201).json(serializeVariant(variant));
  } catch (e: any) {
    if (e.code === "P2002" || e.code === "23505") {
      res.status(409).json({ error: "SKU already exists" });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

router.patch("/products/:productId/variants/:variantId", requireAuth, requirePermission("products", "update"), async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.productId), 10);
  const variantId = parseInt(String(req.params.variantId), 10);
  if (Number.isNaN(productId) || Number.isNaN(variantId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateProductVariantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await prisma.productVariant.findFirst({
    where: { id: variantId, productId },
  });
  if (!existing) {
    res.status(404).json({ error: "Variant not found" });
    return;
  }

  const d = parsed.data;
  const data: Record<string, unknown> = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.sku !== undefined) data.sku = d.sku;
  if (d.stockQty !== undefined) data.stockQty = d.stockQty;
  if (d.lowStockThreshold !== undefined) data.lowStockThreshold = d.lowStockThreshold;
  if (d.attributes !== undefined) data.attributes = d.attributes;
  if (d.isActive !== undefined) data.isActive = d.isActive;
  if (d.price !== undefined) {
    data.price = d.price === null ? null : String(d.price);
  }
  if (d.imageUrl !== undefined) {
    data.imageUrl = d.imageUrl ?? null;
  }

  if (Object.keys(data).length === 0) {
    res.json(serializeVariant(existing));
    return;
  }

  const user = (req as { user?: { branchId: number | null } }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const writeBranchId = await requireWriteBranchId(req, res, user);
  if (writeBranchId == null) return;

  try {
    const previousStock = existing.stockQty;
    const variant = await prisma.productVariant.update({
      where: { id: variantId },
      data,
    });
    if (d.stockQty !== undefined && d.stockQty !== previousStock) {
      const delta = d.stockQty - previousStock;
      await prisma.inventoryLog.create({
        data: {
          productId,
          variantId,
          type: delta >= 0 ? "in" : "out",
          quantity: Math.abs(delta),
          notes: `Stock changed via variant update (${variant.name})`,
          branchId: writeBranchId,
        },
      });
    }
    if (d.attributes !== undefined) {
      await syncAttributeCatalogFromJson(d.attributes);
    }
    await syncProductStockFromVariants(productId);
    res.json(serializeVariant(variant));
  } catch (e: any) {
    if (e.code === "P2002" || e.code === "23505") {
      res.status(409).json({ error: "SKU already exists" });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

router.delete("/products/:productId/variants/:variantId", requireAuth, requirePermission("products", "delete"), async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.productId), 10);
  const variantId = parseInt(String(req.params.variantId), 10);
  if (Number.isNaN(productId) || Number.isNaN(variantId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, productId },
  });
  if (!variant) {
    res.status(404).json({ error: "Variant not found" });
    return;
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.inventoryLog.deleteMany({ where: { variantId } });
      await tx.productVariant.delete({ where: { id: variantId } });
    });
    await syncProductStockFromVariants(productId);
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to delete variant";
    res.status(500).json({ error: msg });
  }
});

export default router;
