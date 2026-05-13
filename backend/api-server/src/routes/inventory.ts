import { Router, IRouter } from "express";
import { AdjustInventoryBody } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma, toNumber } from "../lib/prisma";
import { decrementProductStock, incrementProductStock, setProductStockAbsolute, syncProductStockFromVariants } from "../lib/product-stock";
import { requireWriteBranchId } from "../lib/branch-scope";

const router: IRouter = Router();

router.get("/inventory/logs", requireAuth, requirePermission("inventory", "read"), async (req, res): Promise<void> => {
  const { productId, type, branchId, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const where: Record<string, any> = {};
  if (productId) where.productId = parseInt(productId, 10);
  if (type) where.type = type;
  if (branchId) where.branchId = parseInt(branchId, 10);

  const [total, logs] = await prisma.$transaction([
    prisma.inventoryLog.count({ where }),
    prisma.inventoryLog.findMany({
      where,
      skip: offset,
      take: limitNum,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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

  const data = logs.map(l => ({ ...l, product: products[l.productId] || null, variant: (l as any).variantId ? variants[(l as any).variantId] ?? null : null }));
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

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  try {
    if (variantId) {
      const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
      if (!variant || variant.productId !== productId) {
        res.status(400).json({ error: "Invalid variant for product" });
        return;
      }
      if (type === "in") {
        await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: variant.stockQty + quantity } });
      } else if (type === "out") {
        if (variant.stockQty < quantity) {
          res.status(400).json({ error: "Insufficient stock" });
          return;
        }
        await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: variant.stockQty - quantity } });
      } else {
        await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: Math.max(0, quantity) } });
      }
      await syncProductStockFromVariants(productId);
    } else {
      if (type === "in") await incrementProductStock(productId, quantity);
      else if (type === "out") await decrementProductStock(productId, quantity);
      else await setProductStockAbsolute(productId, quantity);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Insufficient stock across variants") {
      res.status(400).json({ error: "Insufficient stock" });
      return;
    }
    res.status(500).json({ error: msg });
    return;
  }

  const refreshed = await prisma.product.findUnique({ where: { id: productId } });
  const log = await prisma.inventoryLog.create({
    data: { productId, variantId: variantId ?? null, type, quantity, notes, branchId: writeBranchId },
  });
  const variant = variantId ? await prisma.productVariant.findUnique({ where: { id: variantId } }) : null;
  const p = refreshed ?? product;
  res.json({
    ...log,
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
