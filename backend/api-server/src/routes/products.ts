import { Router, IRouter } from "express";
import { CreateProductBody, UpdateProductBody, GetProductParams } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission, requireProductsCreateOrUpdate } from "../lib/permissions";
import { prisma, toNumber } from "../lib/prisma";
import { syncProductStockFromVariants } from "../lib/product-stock";
import { syncAttributeCatalogFromJson } from "../lib/attribute-catalog";
import { requireWriteBranchId } from "../lib/branch-scope";
import { parseImageUrlsJson, serializeImageUrls } from "../lib/image-urls";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";

const router: IRouter = Router();

class ProductDeleteBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductDeleteBlockedError";
  }
}

/** Inventory logs block product delete; order/PO line items must be removed manually. */
async function deleteProductWithDependents(productId: number): Promise<void> {
  const existing = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!existing) {
    throw Object.assign(new Error("Product not found"), { code: "NOT_FOUND" });
  }

  const [orderItemCount, poItemCount] = await Promise.all([
    prisma.orderItem.count({ where: { productId } }),
    prisma.purchaseOrderItem.count({ where: { productId } }),
  ]);

  if (orderItemCount > 0 || poItemCount > 0) {
    const parts: string[] = [];
    if (orderItemCount > 0) parts.push(`${orderItemCount} order line item(s)`);
    if (poItemCount > 0) parts.push(`${poItemCount} purchase order line item(s)`);
    throw new ProductDeleteBlockedError(
      `Cannot delete this product: it is referenced by ${parts.join(" and ")}. Remove those references first.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.inventoryLog.deleteMany({ where: { productId } });
    await tx.product.delete({ where: { id: productId } });
  });
}

const productImageUploadDir = path.resolve(process.cwd(), "uploads", "products");
if (!fs.existsSync(productImageUploadDir)) fs.mkdirSync(productImageUploadDir, { recursive: true });

const productImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, productImageUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
      cb(null, `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image uploads are allowed"));
  },
});

async function enrichProduct(p: any, extras?: { isLowStock?: boolean }) {
  const { _count, category: catRow, ...rest } = p;
  let category = catRow ? { ...catRow, children: [] as never[] } : null;
  if (!category && rest.categoryId) {
    const c = await prisma.category.findUnique({ where: { id: rest.categoryId } });
    if (c) category = { ...c, children: [] };
  }

  let categoryPath: string | null = null;
  if (category) {
    if (category.parentId) {
      const parent = await prisma.category.findUnique({ where: { id: category.parentId } });
      categoryPath = parent ? `${parent.name} · ${category.name}` : category.name;
    } else {
      categoryPath = category.name;
    }
  }

  let variantCount = typeof _count?.variants === "number" ? _count.variants : undefined;
  if (variantCount === undefined) {
    variantCount = await prisma.productVariant.count({ where: { productId: rest.id } });
  }

  const imageUrls = parseImageUrlsJson(rest.imageUrls, rest.imageUrl);
  return {
    ...rest,
    imageUrls,
    imageUrl: imageUrls[0] ?? null,
    price: toNumber(rest.price),
    gstPercent: toNumber(rest.gstPercent),
    category,
    categoryPath,
    variantCount,
    isLowStock: extras?.isLowStock,
  };
}

function resolveProductImagesInput(
  body: { imageUrls?: string[] | null; imageUrl?: string | null },
): { imageUrls: string | null; imageUrl: string | null } {
  if (body.imageUrls !== undefined) {
    return serializeImageUrls(body.imageUrls);
  }
  const single = body.imageUrl?.trim() || null;
  return serializeImageUrls(single ? [single] : []);
}

function productMatchesCategoryFilter(
  productCategoryId: number | null,
  filterId: number,
  allCats: { id: number; parentId: number | null }[],
): boolean {
  if (productCategoryId == null) return false;
  if (productCategoryId === filterId) return true;
  const c = allCats.find((x) => x.id === productCategoryId);
  return c?.parentId === filterId;
}

router.post(
  "/products/upload-image",
  requireAuth,
  requireProductsCreateOrUpdate,
  productImageUpload.single("image"),
  (req, res): void => {
    if (!(req as any).file) {
      res.status(400).json({ error: "Image file is required (field name: image)" });
      return;
    }
    const filename = (req as any).file.filename as string;
    res.json({ imageUrl: `/uploads/products/${filename}` });
  },
);

router.get("/products", requireAuth, requirePermission("products", "read"), async (req, res): Promise<void> => {
  const { search, categoryId, lowStock, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const allCats = await prisma.category.findMany({ select: { id: true, parentId: true } });

  let products = await prisma.product.findMany({
    include: {
      category: true,
      _count: { select: { variants: true } },
    },
    orderBy: { id: "desc" },
  });
  if (search) {
    const q = search.toLowerCase();
    products = products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  }
  if (categoryId) {
    const fid = parseInt(categoryId, 10);
    products = products.filter((p) => productMatchesCategoryFilter(p.categoryId, fid, allCats));
  }

  const idsWithVariants = products.filter((p) => p._count.variants > 0).map((p) => p.id);
  const lowFromVariant = new Map<number, boolean>();
  if (idsWithVariants.length) {
    const vrows = await prisma.productVariant.findMany({
      where: { productId: { in: idsWithVariants } },
      select: { productId: true, stockQty: true, lowStockThreshold: true },
    });
    for (const v of vrows) {
      if (v.stockQty <= v.lowStockThreshold) lowFromVariant.set(v.productId, true);
    }
  }

  const rowIsLow = (p: (typeof products)[0]) => {
    if (p._count.variants === 0) return p.stockQty <= p.lowStockThreshold;
    return !!lowFromVariant.get(p.id);
  };

  if (lowStock === "true") products = products.filter(rowIsLow);

  const total = products.length;
  const pageRows = products.slice(offset, offset + limitNum);
  const data = await Promise.all(
    pageRows.map((row) => enrichProduct(row, { isLowStock: rowIsLow(row) })),
  );
  res.json({ data, total, page: pageNum, limit: limitNum });
});

router.post("/products", requireAuth, requirePermission("products", "create"), async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const mode = d.inventoryMode ?? "simple";
  const stockQty = mode === "simple" ? (d.stockQty ?? 0) : 0;

  const user = (req as { user?: { branchId: number | null } }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const writeBranchId = await requireWriteBranchId(req, res, user);
  if (writeBranchId == null) return;

  try {
    const images = resolveProductImagesInput({
      imageUrls: d.imageUrls as string[] | undefined,
      imageUrl: d.imageUrl,
    });

    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          name: d.name,
          sku: d.sku,
          categoryId: d.categoryId ?? null,
          imageUrl: images.imageUrl,
          imageUrls: images.imageUrls,
          price: String(d.price),
          gstPercent: String(d.gstPercent),
          stockQty,
          lowStockThreshold: d.lowStockThreshold,
          description: d.description ?? null,
          attributes: mode === "simple" ? (d.attributes ?? null) : null,
        },
      });
      if (mode === "simple" && d.attributes) {
        await syncAttributeCatalogFromJson(d.attributes, tx);
      }
      if (stockQty > 0) {
        await tx.inventoryLog.create({
          data: {
            productId: p.id,
            type: "in",
            quantity: stockQty,
            notes: "Initial stock on product creation",
            branchId: writeBranchId,
          },
        });
      }
      if (mode === "variants" && d.initialVariants?.length) {
        for (const v of d.initialVariants) {
          const vImages = resolveProductImagesInput({
            imageUrls: (v as { imageUrls?: string[] }).imageUrls,
            imageUrl: v.imageUrl,
          });
          const createdVariant = await tx.productVariant.create({
            data: {
              productId: p.id,
              name: v.name,
              sku: v.sku,
              imageUrl: vImages.imageUrl,
              imageUrls: vImages.imageUrls,
              price: v.price != null ? String(v.price) : null,
              stockQty: v.stockQty ?? 0,
              lowStockThreshold: v.lowStockThreshold ?? 10,
              attributes: v.attributes ?? null,
              isActive: true,
            },
          });
          if ((v.stockQty ?? 0) > 0) {
            await tx.inventoryLog.create({
              data: {
                productId: p.id,
                variantId: createdVariant.id,
                type: "in",
                quantity: v.stockQty ?? 0,
                notes: `Initial stock for variant ${createdVariant.name}`,
                branchId: writeBranchId,
              },
            });
          }
          await syncAttributeCatalogFromJson(v.attributes ?? null, tx);
        }
        await syncProductStockFromVariants(p.id, tx);
      }
      return p;
    });

    const refreshed = await prisma.product.findUnique({
      where: { id: product.id },
      include: { category: true, _count: { select: { variants: true } } },
    });
    res.status(201).json(await enrichProduct(refreshed ?? product));
  } catch (e: any) {
    if (e?.code === "P2002") {
      res.status(409).json({ error: "SKU already exists" });
      return;
    }
    throw e;
  }
});

router.get("/products/:id", requireAuth, requirePermission("products", "read"), async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const product = await prisma.product.findUnique({
    where: { id: params.data.id },
    include: { category: true, _count: { select: { variants: true } } },
  });
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  let isLowStock: boolean;
  if (product._count.variants === 0) {
    isLowStock = product.stockQty <= product.lowStockThreshold;
  } else {
    const variants = await prisma.productVariant.findMany({
      where: { productId: product.id },
      select: { stockQty: true, lowStockThreshold: true },
    });
    isLowStock = variants.some((v) => v.stockQty <= v.lowStockThreshold);
  }

  res.json(await enrichProduct(product, { isLowStock }));
});

router.put("/products/:id", requireAuth, requirePermission("products", "update"), async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = params.data.id;
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const variantCount = await prisma.productVariant.count({ where: { productId: id } });

  try {
    const existingProduct = await prisma.product.findUnique({ where: { id } });
    if (!existingProduct) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const user = (req as { user?: { branchId: number | null } }).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const stockWillLog =
      d.stockQty !== undefined && variantCount === 0 && d.stockQty !== existingProduct.stockQty;
    let writeBranchId: number | null = null;
    if (stockWillLog) {
      const wid = await requireWriteBranchId(req, res, user);
      if (wid == null) return;
      writeBranchId = wid;
    }

    const images =
      d.imageUrls !== undefined || d.imageUrl !== undefined
        ? resolveProductImagesInput({
            imageUrls: d.imageUrls as string[] | undefined,
            imageUrl: d.imageUrl,
          })
        : null;

    const updateData: Record<string, unknown> = {
      name: d.name,
      sku: d.sku,
      categoryId: d.categoryId ?? null,
      ...(images != null ? { imageUrl: images.imageUrl, imageUrls: images.imageUrls } : {}),
      price: String(d.price),
      gstPercent: String(d.gstPercent),
      lowStockThreshold: d.lowStockThreshold,
      description: d.description ?? null,
    };
    if (d.attributes !== undefined && variantCount === 0) {
      updateData.attributes = d.attributes;
    } else if (variantCount > 0) {
      updateData.attributes = null;
    }
    if (d.stockQty !== undefined && variantCount === 0) {
      updateData.stockQty = d.stockQty;
    }

    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: updateData,
      });
      if (d.stockQty !== undefined && variantCount === 0 && d.stockQty !== existingProduct.stockQty) {
        const delta = d.stockQty - existingProduct.stockQty;
        await tx.inventoryLog.create({
          data: {
            productId: id,
            type: delta >= 0 ? "in" : "out",
            quantity: Math.abs(delta),
            notes: "Stock changed via product update",
            branchId: writeBranchId as number,
          },
        });
      }
      if (d.attributes !== undefined && variantCount === 0) {
        await syncAttributeCatalogFromJson(d.attributes ?? null, tx);
      }
      return updated;
    });
    await syncProductStockFromVariants(id);
    const refreshed = await prisma.product.findUnique({
      where: { id },
      include: { category: true, _count: { select: { variants: true } } },
    });
    res.json(await enrichProduct(refreshed ?? product));
  } catch (e: any) {
    if (e?.code === "P2025") {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (e?.code === "P2002") {
      res.status(409).json({ error: "SKU already exists" });
      return;
    }
    throw e;
  }
});

router.delete("/products/:id", requireAuth, requirePermission("products", "delete"), async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = params.data.id;
  try {
    await deleteProductWithDependents(id);
    res.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof ProductDeleteBlockedError) {
      res.status(409).json({ error: e.message });
      return;
    }
    const err = e as { code?: string; message?: string };
    if (err?.code === "NOT_FOUND") {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.status(500).json({ error: err?.message ?? "Failed to delete product" });
  }
});

export default router;
