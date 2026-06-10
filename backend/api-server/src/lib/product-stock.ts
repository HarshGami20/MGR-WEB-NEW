import type { Prisma } from "@prisma/client";
import { getBranchStockQty } from "./branch-stock";
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

/** Decrease stock for a sales order at a specific branch (inventory logs = source of truth). */
async function hasInventoryLogs(
  productId: number,
  variantId: number | null,
  db: Db,
): Promise<boolean> {
  const count = await db.inventoryLog.count({
    where: { productId, variantId: variantId ?? null },
  });
  return count > 0;
}

export async function decrementProductStockForBranch(
  productId: number,
  quantity: number,
  branchId: number,
  db: Db = prisma,
  variantId?: number | null,
): Promise<StockMovement[]> {
  const count = await db.productVariant.count({ where: { productId } });
  if (count === 0) {
    const available = await getBranchStockQty(productId, null, branchId, db);
    if (available < quantity) {
      const logged = await hasInventoryLogs(productId, null, db);
      if (!logged) {
        return decrementProductStock(productId, quantity, db, null);
      }
      throw new Error("Insufficient stock");
    }
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error(`Product ${productId} not found`);
    await db.product.update({
      where: { id: productId },
      data: { stockQty: Math.max(0, product.stockQty - quantity) },
    });
    return [{ productId, variantId: null, quantity }];
  }

  if (variantId != null) {
    const variant = await db.productVariant.findFirst({ where: { id: variantId, productId } });
    if (!variant) throw new Error(`Variant ${variantId} is not valid for product ${productId}`);
    const available = await getBranchStockQty(productId, variantId, branchId, db);
    if (available < quantity) {
      const logged = await hasInventoryLogs(productId, variantId, db);
      if (!logged) {
        return decrementProductStock(productId, quantity, db, variantId);
      }
      throw new Error("Insufficient stock");
    }
    await db.productVariant.update({
      where: { id: variantId },
      data: { stockQty: Math.max(0, variant.stockQty - quantity) },
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
    const available = await getBranchStockQty(productId, id, branchId, db);
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    const variant = await db.productVariant.findUnique({ where: { id } });
    if (!variant) continue;
    await db.productVariant.update({
      where: { id },
      data: { stockQty: Math.max(0, variant.stockQty - take) },
    });
    movements.push({ productId, variantId: id, quantity: take });
    remaining -= take;
  }

  if (remaining > 0) throw new Error("Insufficient stock");

  await syncProductStockFromVariants(productId, db);
  return movements;
}

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
