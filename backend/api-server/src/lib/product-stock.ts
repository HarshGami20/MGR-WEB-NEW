import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export type StockMovement = {
  productId: number;
  variantId: number | null;
  quantity: number;
};

/** Keep product.stockQty equal to sum of variant stocks (0 if no variants). */
export async function syncProductStockFromVariants(productId: number, db: Db = prisma): Promise<void> {
  const agg = await db.productVariant.aggregate({
    where: { productId },
    _sum: { stockQty: true },
  });
  const total = agg._sum.stockQty ?? 0;
  await db.product.update({
    where: { id: productId },
    data: { stockQty: total },
  });
}

export async function productVariantCount(productId: number, db: Db = prisma): Promise<number> {
  return db.productVariant.count({ where: { productId } });
}

/**
 * Decrease sellable quantity: FIFO across variants when the product has variants;
 * otherwise decrease product.stockQty only (legacy simple products).
 */
export async function decrementProductStock(
  productId: number,
  quantity: number,
  db: Db = prisma,
  variantId?: number | null,
): Promise<StockMovement[]> {
  const count = await db.productVariant.count({ where: { productId } });
  if (count === 0) {
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error(`Product ${productId} not found`);
    if (product.stockQty < quantity) throw new Error("Insufficient stock");
    await db.product.update({
      where: { id: productId },
      data: { stockQty: product.stockQty - quantity },
    });
    return [{ productId, variantId: null, quantity }];
  }

  if (variantId != null) {
    const variant = await db.productVariant.findFirst({ where: { id: variantId, productId } });
    if (!variant) throw new Error(`Variant ${variantId} is not valid for product ${productId}`);
    if (variant.stockQty < quantity) throw new Error("Insufficient stock");
    await db.productVariant.update({
      where: { id: variantId },
      data: { stockQty: variant.stockQty - quantity },
    });
    await syncProductStockFromVariants(productId, db);
    return [{ productId, variantId, quantity }];
  }

  let remaining = quantity;
  const movements: StockMovement[] = [];
  const ids = await db.productVariant.findMany({
    where: { productId },
    orderBy: { id: "asc" },
    select: { id: true },
  });

  for (const { id } of ids) {
    if (remaining <= 0) break;
    const row = await db.productVariant.findUnique({ where: { id } });
    if (!row || row.stockQty <= 0) continue;
    const take = Math.min(row.stockQty, remaining);
    await db.productVariant.update({
      where: { id },
      data: { stockQty: row.stockQty - take },
    });
    movements.push({ productId, variantId: id, quantity: take });
    remaining -= take;
  }

  if (remaining > 0) throw new Error("Insufficient stock");

  await syncProductStockFromVariants(productId, db);
  return movements;
}

/**
 * Increase stock: when variants exist, add to the first variant (by id); otherwise product only.
 */
export async function incrementProductStock(
  productId: number,
  quantity: number,
  db: Db = prisma,
  variantId?: number | null,
): Promise<StockMovement[]> {
  const count = await db.productVariant.count({ where: { productId } });
  if (count === 0) {
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error(`Product ${productId} not found`);
    await db.product.update({
      where: { id: productId },
      data: { stockQty: product.stockQty + quantity },
    });
    return [{ productId, variantId: null, quantity }];
  }

  if (variantId != null) {
    const variant = await db.productVariant.findFirst({ where: { id: variantId, productId } });
    if (!variant) throw new Error(`Variant ${variantId} is not valid for product ${productId}`);
    await db.productVariant.update({
      where: { id: variantId },
      data: { stockQty: variant.stockQty + quantity },
    });
    await syncProductStockFromVariants(productId, db);
    return [{ productId, variantId, quantity }];
  }

  const first = await db.productVariant.findFirst({
    where: { productId },
    orderBy: { id: "asc" },
  });
  if (!first) throw new Error(`No variants for product ${productId}`);
  await db.productVariant.update({
    where: { id: first.id },
    data: { stockQty: first.stockQty + quantity },
  });
  await syncProductStockFromVariants(productId, db);
  return [{ productId, variantId: first.id, quantity }];
}

/** Set absolute product stock when there are no variants (inventory "adjustment"). */
export async function setProductStockAbsolute(
  productId: number,
  quantity: number,
  db: Db = prisma,
  variantId?: number | null,
): Promise<StockMovement[]> {
  const count = await db.productVariant.count({ where: { productId } });
  if (count === 0) {
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error(`Product ${productId} not found`);
    await db.product.update({
      where: { id: productId },
      data: { stockQty: Math.max(0, quantity) },
    });
    return [{ productId, variantId: null, quantity: Math.max(0, quantity) }];
  }
  if (variantId != null) {
    const variant = await db.productVariant.findFirst({ where: { id: variantId, productId } });
    if (!variant) throw new Error(`Variant ${variantId} is not valid for product ${productId}`);
    const nextQty = Math.max(0, quantity);
    await db.productVariant.update({
      where: { id: variantId },
      data: { stockQty: nextQty },
    });
    await syncProductStockFromVariants(productId, db);
    return [{ productId, variantId, quantity: nextQty }];
  }
  const first = await db.productVariant.findFirst({
    where: { productId },
    orderBy: { id: "asc" },
  });
  if (!first) throw new Error(`No variants for product ${productId}`);
  const agg = await db.productVariant.aggregate({
    where: { productId, id: { not: first.id } },
    _sum: { stockQty: true },
  });
  const others = agg._sum.stockQty ?? 0;
  const targetFirst = Math.max(0, quantity - others);
  await db.productVariant.update({
    where: { id: first.id },
    data: { stockQty: targetFirst },
  });
  await syncProductStockFromVariants(productId, db);
  return [{ productId, variantId: first.id, quantity: targetFirst }];
}
