import { Router, IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { requireProductReadAccess } from "../lib/partner-product-scope";
import { CreateProductVariantBody, UpdateProductVariantBody } from "../zod";
import { prisma, toNumber } from "../lib/prisma";
import { syncProductStockFromVariants } from "../lib/product-stock";
import { syncAttributeCatalogFromJson } from "../lib/attribute-catalog";
import { requireWriteBranchId } from "../lib/branch-scope";
import { emitInventoryUpdated } from "../lib/inventory-events";
import { parseImageUrlsJson, serializeImageUrls } from "../lib/image-urls";
import { collectVariantUploadUrls } from "../lib/collect-product-upload-urls";
import { deleteUploadFilesByUrl } from "../lib/delete-upload-files";

const router: IRouter = Router();

function resolveVariantImagesInput(body: {
  imageUrls?: string[] | null;
  imageUrl?: string | null;
}): { imageUrls: string | null; imageUrl: string | null } {
  if (body.imageUrls !== undefined) {
    return serializeImageUrls(body.imageUrls);
  }
  const single = body.imageUrl?.trim() || null;
  return serializeImageUrls(single ? [single] : []);
}

function serializeVariant(v: any) {
  const { ...rest } = v;
  const imageUrls = parseImageUrlsJson(rest.imageUrls, rest.imageUrl);
  return {
    ...rest,
    imageUrls,
    imageUrl: imageUrls[0] ?? null,
    price: v.price != null ? toNumber(v.price) : null,
  };
}

type BranchStockRow = {
  branchId: number | null;
  branchName: string;
  stockQty: number;
};

async function branchStockByVariant(variantIds: number[]): Promise<Map<number, BranchStockRow[]>> {
  const result = new Map<number, BranchStockRow[]>();
  if (variantIds.length === 0) return result;

  const logs = await prisma.inventoryLog.findMany({
    where: { variantId: { in: variantIds } },
    include: { branch: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const stockByVariantBranch = new Map<string, number>();
  const branchLabels = new Map<string, { branchId: number | null; branchName: string }>();

  for (const log of logs) {
    if (log.variantId == null) continue;
    const branchKey = log.branchId == null ? "unassigned" : String(log.branchId);
    const key = `${log.variantId}:${branchKey}`;
    const current = stockByVariantBranch.get(key) ?? 0;

    if (log.type === "in") {
      stockByVariantBranch.set(key, current + log.quantity);
    } else if (log.type === "out") {
      stockByVariantBranch.set(key, current - log.quantity);
    } else if (log.type === "adjustment") {
      stockByVariantBranch.set(key, log.quantity);
    }

    branchLabels.set(branchKey, {
      branchId: log.branchId ?? null,
      branchName: log.branch?.name ?? "Unassigned",
    });
  }

  for (const [key, qty] of stockByVariantBranch.entries()) {
    const [variantIdRaw, branchKey] = key.split(":");
    const variantId = Number(variantIdRaw);
    const branch = branchLabels.get(branchKey);
    if (!branch) continue;
    const rows = result.get(variantId) ?? [];
    rows.push({ ...branch, stockQty: Math.max(0, qty) });
    result.set(variantId, rows);
  }

  for (const rows of result.values()) {
    rows.sort((a, b) => a.branchName.localeCompare(b.branchName));
  }

  return result;
}

router.get("/products/:productId/variants", requireAuth, requireProductReadAccess(), async (req, res): Promise<void> => {
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
  const branchStocks = await branchStockByVariant(variants.map((variant) => variant.id));
  res.json(
    variants.map((variant) => ({
      ...serializeVariant(variant),
      branchStocks: branchStocks.get(variant.id) ?? [],
    })),
  );
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
    const images = resolveVariantImagesInput({
      imageUrls: parsed.data.imageUrls,
      imageUrl: parsed.data.imageUrl,
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        name: parsed.data.name,
        sku: parsed.data.sku,
        imageUrl: images.imageUrl,
        imageUrls: images.imageUrls,
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
  if (d.imageUrls !== undefined || d.imageUrl !== undefined) {
    const images = resolveVariantImagesInput({
      imageUrls: d.imageUrls,
      imageUrl: d.imageUrl,
    });
    data.imageUrl = images.imageUrl;
    data.imageUrls = images.imageUrls;
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
      await emitInventoryUpdated({
        productId,
        variantId,
        type: delta >= 0 ? "in" : "out",
        quantity: Math.abs(delta),
        newStockQty: d.stockQty,
        notes: `Stock changed via variant update (${variant.name})`,
        branchId: writeBranchId,
        updatedById: (req as { user?: { id: number } }).user?.id,
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
    select: { id: true, imageUrl: true, imageUrls: true },
  });
  if (!variant) {
    res.status(404).json({ error: "Variant not found" });
    return;
  }
  try {
    const uploadUrls = collectVariantUploadUrls(variant);

    await prisma.$transaction(async (tx) => {
      await tx.inventoryLog.deleteMany({ where: { variantId } });
      await tx.productVariant.delete({ where: { id: variantId } });
    });

    deleteUploadFilesByUrl(uploadUrls);

    await syncProductStockFromVariants(productId);
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to delete variant";
    res.status(500).json({ error: msg });
  }
});

export default router;
