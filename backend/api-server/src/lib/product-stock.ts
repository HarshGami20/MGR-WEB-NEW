import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type Db = Prisma.TransactionClient | typeof prisma;

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
export async function decrementProductStock(productId: number, quantity: number, db: Db = prisma): Promise<void> {
  const count = await db.productVariant.count({ where: { productId } });
  if (count === 0) {
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error(`Product ${productId} not found`);
    await db.product.update({
      where: { id: productId },
      data: { stockQty: Math.max(0, product.stockQty - quantity) },
    });
    return;
  }

  let remaining = quantity;
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
    remaining -= take;
  }

  if (remaining > 0) throw new Error("Insufficient stock across variants");

  await syncProductStockFromVariants(productId, db);
}

/**
 * Increase stock: when variants exist, add to the first variant (by id); otherwise product only.
 */
export async function incrementProductStock(productId: number, quantity: number, db: Db = prisma): Promise<void> {
  const count = await db.productVariant.count({ where: { productId } });
  if (count === 0) {
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error(`Product ${productId} not found`);
    await db.product.update({
      where: { id: productId },
      data: { stockQty: product.stockQty + quantity },
    });
    return;
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
}

/** Set absolute product stock when there are no variants (inventory "adjustment"). */
export async function setProductStockAbsolute(productId: number, quantity: number, db: Db = prisma): Promise<void> {
  const count = await db.productVariant.count({ where: { productId } });
  if (count === 0) {
    await db.product.update({
      where: { id: productId },
      data: { stockQty: Math.max(0, quantity) },
    });
    return;
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
}
