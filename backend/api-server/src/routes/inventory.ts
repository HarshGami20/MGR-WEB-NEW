import { Router, IRouter } from "express";
import type { Prisma } from "@prisma/client";
import { AdjustInventoryBody } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma, toNumber } from "../lib/prisma";
import {
  decrementProductStockForBranch,
  getReducibleStockQty,
  incrementProductStock,
  InsufficientStockError,
  setProductStockAbsolute,
} from "../lib/product-stock";
import { requireWriteBranchId } from "../lib/branch-scope";
import { ymdUtcDayEnd, ymdUtcDayStart } from "../lib/date-range";
import { inventoryLogProductInCategories, resolveCategoryFilterIds } from "../lib/category-filter";
import { emitInventoryUpdated } from "../lib/inventory-events";

const router: IRouter = Router();

router.get("/inventory/logs", requireAuth, requirePermission("inventory", "read"), async (req, res): Promise<void> => {
  const { productId, type, branchId, page = "1", limit = "20", createdFrom, createdTo, categoryId, search } =
    req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const and: Prisma.InventoryLogWhereInput[] = [];
  if (productId) and.push({ productId: parseInt(productId, 10) });
  if (type) and.push({ type });
  if (branchId) and.push({ branchId: parseInt(branchId, 10) });

  const createdAtFilter: { gte?: Date; lte?: Date } = {};
  if (typeof createdFrom === "string" && createdFrom.trim()) {
    const start = ymdUtcDayStart(createdFrom.trim());
    if (start) createdAtFilter.gte = start;
  }
  if (typeof createdTo === "string" && createdTo.trim()) {
    const end = ymdUtcDayEnd(createdTo.trim());
    if (end) createdAtFilter.lte = end;
  }
  if (createdAtFilter.gte != null || createdAtFilter.lte != null) {
    and.push({ createdAt: createdAtFilter });
  }

  const categoryIds = await resolveCategoryFilterIds(categoryId);
  if (categoryIds) {
    and.push(inventoryLogProductInCategories(categoryIds));
  }

  const searchTrim = typeof search === "string" ? search.trim() : "";
  if (searchTrim) {
    and.push({
      OR: [
        { notes: { contains: searchTrim, mode: "insensitive" } },
        { product: { name: { contains: searchTrim, mode: "insensitive" } } },
        { product: { sku: { contains: searchTrim, mode: "insensitive" } } },
        { variant: { name: { contains: searchTrim, mode: "insensitive" } } },
        { variant: { sku: { contains: searchTrim, mode: "insensitive" } } },
        { user: { name: { contains: searchTrim, mode: "insensitive" } } },
      ],
    });
  }

  const where: Prisma.InventoryLogWhereInput = and.length ? { AND: and } : {};

  const [total, logs] = await prisma.$transaction([
    prisma.inventoryLog.count({ where }),
    prisma.inventoryLog.findMany({
      where,
      skip: offset,
      take: limitNum,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        user: { select: { id: true, name: true, mobile: true } },
      },
    }),
  ]);

  const productIds = [...new Set(logs.map(l => l.productId))];
  const products: Record<number, any> = {};
  for (const pid of productIds) {
    const p = await prisma.product.findUnique({ where: { id: pid } });
    if (p) products[p.id] = { ...p, price: toNumber(p.price), gstPercent: toNumber(p.gstPercent) };
  }

  const variantIds = [...new Set(logs.map((l: any) => l.variantId).filter((x: any) => x != null))] as number[];
  const variants: Record<number, any> = {};
  for (const vid of variantIds) {
    const v = await prisma.productVariant.findUnique({ where: { id: vid } });
    if (v) variants[v.id] = { ...v, price: v.price != null ? toNumber(v.price) : null, attributes: v.attributes ?? null };
  }

  const data = logs.map((l) => ({
    ...l,
    product: products[l.productId] || null,
    variant: (l as any).variantId ? variants[(l as any).variantId] ?? null : null,
    user: (l as { user?: { id: number; name: string; mobile: string | null } | null }).user ?? null,
  }));
  res.json({ data, total, page: pageNum, limit: limitNum });
});

router.post("/inventory/adjust", requireAuth, requirePermission("inventory", "update"), async (req, res): Promise<void> => {
  const parsed = AdjustInventoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const user = (req as { user?: { branchId: number | null } }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const writeBranchId = await requireWriteBranchId(req, res, user);
  if (writeBranchId == null) return;

  const { productId, type, quantity, notes } = parsed.data as any;
  const variantId: number | null | undefined = (parsed.data as any).variantId;
  const actorId = (req as { user?: { id: number } }).user?.id;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  let movements: Array<{ productId: number; variantId: number | null; quantity: number }> = [];
  try {
    if (variantId) {
      const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
      if (!variant || variant.productId !== productId) {
        res.status(400).json({ error: "Invalid variant for product" });
        return;
      }
      if (type === "in") {
        movements = await incrementProductStock(productId, quantity, prisma, variantId);
      } else if (type === "out") {
        const available = await getReducibleStockQty(productId, writeBranchId, prisma, variantId);
        if (quantity > available) {
          res.status(400).json({ error: `Cannot reduce more than in-stock quantity (${available})` });
          return;
        }
        movements = await decrementProductStockForBranch(
          productId,
          quantity,
          writeBranchId,
          prisma,
          variantId,
        );
      } else {
        movements = await setProductStockAbsolute(productId, quantity, prisma, variantId);
      }
    } else {
      if (type === "in") {
        movements = await incrementProductStock(productId, quantity);
      } else if (type === "out") {
        const available = await getReducibleStockQty(productId, writeBranchId, prisma, null);
        if (quantity > available) {
          res.status(400).json({ error: `Cannot reduce more than in-stock quantity (${available})` });
          return;
        }
        movements = await decrementProductStockForBranch(
          productId,
          quantity,
          writeBranchId,
          prisma,
          null,
        );
      } else {
        movements = await setProductStockAbsolute(productId, quantity);
      }
    }
  } catch (e: unknown) {
    if (e instanceof InsufficientStockError) {
      res.status(400).json({ error: e.message });
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Insufficient stock") {
      res.status(400).json({ error: "Insufficient stock" });
      return;
    }
    res.status(500).json({ error: msg });
    return;
  }

  const refreshed = await prisma.product.findUnique({ where: { id: productId } });
  const createdLogs = await Promise.all(
    movements.map((movement) =>
      prisma.inventoryLog.create({
        data: {
          productId: movement.productId,
          variantId: movement.variantId,
          type,
          quantity: movement.quantity,
          notes,
          branchId: writeBranchId,
          userId: actorId ?? null,
        },
      }),
    ),
  );
  const variant = variantId ? await prisma.productVariant.findUnique({ where: { id: variantId } }) : null;
  const p = refreshed ?? product;

  const newStockQty = variant ? variant.stockQty : (refreshed?.stockQty ?? product.stockQty);
  await emitInventoryUpdated({
    productId,
    variantId: variantId ?? null,
    type,
    quantity,
    newStockQty,
    notes: notes ?? null,
    branchId: writeBranchId,
    updatedById: actorId,
  });

  res.json({
    ...(createdLogs[0] ?? {
      productId,
      variantId: variantId ?? null,
      type,
      quantity,
      notes,
      branchId: writeBranchId,
    }),
    product: { ...p, price: toNumber(p.price), gstPercent: toNumber(p.gstPercent) },
    variant: variant
      ? { ...variant, price: variant.price != null ? toNumber(variant.price) : null, attributes: variant.attributes ?? null }
      : null,
  });
});

router.get("/inventory/low-stock", requireAuth, requirePermission("inventory", "read"), async (_req, res): Promise<void> => {
  const products = await prisma.product.findMany({ include: { _count: { select: { variants: true } } } });
  const idsWithVariants = products.filter((p) => p._count.variants > 0).map((p) => p.id);
  const productLowFromVariant = new Set<number>();
  if (idsWithVariants.length) {
    const vrows = await prisma.productVariant.findMany({
      where: { productId: { in: idsWithVariants } },
      select: { productId: true, stockQty: true, lowStockThreshold: true },
    }); 
    for (const v of vrows) {
      if (v.stockQty <= v.lowStockThreshold) productLowFromVariant.add(v.productId);
    }
  }
  const low = products
    .filter((p) => { 
      if (p._count.variants === 0) return p.stockQty <= p.lowStockThreshold;
      return productLowFromVariant.has(p.id);
    })
    .map((p) => ({ ...p, price: toNumber(p.price), gstPercent: toNumber(p.gstPercent) }));
  res.json(low);
});

export default router;
