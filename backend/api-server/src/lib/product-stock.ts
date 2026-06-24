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
 * Stock may go negative when quantity exceeds on-hand.
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
    await db.product.update({
      where: { id: productId },
      data: { stockQty: product.stockQty - quantity },
    });
    return [{ productId, variantId: null, quantity }];
  }

  if (variantId != null) {
    const variant = await db.productVariant.findFirst({ where: { id: variantId, productId } });
    if (!variant) throw new Error(`Variant ${variantId} is not valid for product ${productId}`);
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
    if (!row) continue;
    const take = row.stockQty > 0 ? Math.min(row.stockQty, remaining) : 0;
    if (take <= 0) continue;
    await db.productVariant.update({
      where: { id },
      data: { stockQty: row.stockQty - take },
    });
    movements.push({ productId, variantId: id, quantity: take });
    remaining -= take;
  }

  if (remaining > 0) {
    const firstId = ids[0]?.id;
    if (firstId == null) throw new Error(`No variants for product ${productId}`);
    const row = await db.productVariant.findUnique({ where: { id: firstId } });
    if (!row) throw new Error(`Variant ${firstId} not found`);
    await db.productVariant.update({
      where: { id: firstId },
      data: { stockQty: row.stockQty - remaining },
    });
    movements.push({ productId, variantId: firstId, quantity: remaining });
  }

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

/** Maximum quantity that can be reduced at a branch (matches decrementProductStockForBranch rules). */
export async function getReducibleStockQty(
  productId: number,
  branchId: number,
  db: Db = prisma,
  variantId?: number | null,
): Promise<number> {
  const variantCount = await db.productVariant.count({ where: { productId } });
  if (variantCount === 0) {
    const logged = await hasInventoryLogs(productId, null, db);
    if (logged) {
      return getBranchStockQty(productId, null, branchId, db);
    }
    const product = await db.product.findUnique({ where: { id: productId } });
    return product?.stockQty ?? 0;
  }

  if (variantId != null) {
    const logged = await hasInventoryLogs(productId, variantId, db);
    if (logged) {
      return getBranchStockQty(productId, variantId, branchId, db);
    }
    const variant = await db.productVariant.findFirst({ where: { id: variantId, productId } });
    return variant?.stockQty ?? 0;
  }

  const ids = await db.productVariant.findMany({
    where: { productId },
    select: { id: true },
  });
  let total = 0;
  for (const { id } of ids) {
    total += await getBranchStockQty(productId, id, branchId, db);
  }
  return total;
}

export class InsufficientStockError extends Error {
  readonly available: number;

  constructor(available: number) {
    super(`Cannot reduce more than in-stock quantity (${available})`);
    this.name = "InsufficientStockError";
    this.available = available;
  }
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
    const logged = await hasInventoryLogs(productId, null, db);
    if (!logged) {
      return decrementProductStock(productId, quantity, db, null);
    }
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error(`Product ${productId} not found`);
    await db.product.update({
      where: { id: productId },
      data: { stockQty: product.stockQty - quantity },
    });
    return [{ productId, variantId: null, quantity }];
  }

  if (variantId != null) {
    const variant = await db.productVariant.findFirst({ where: { id: variantId, productId } });
    if (!variant) throw new Error(`Variant ${variantId} is not valid for product ${productId}`);
    const logged = await hasInventoryLogs(productId, variantId, db);
    if (!logged) {
      return decrementProductStock(productId, quantity, db, variantId);
    }
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
    const available = await getBranchStockQty(productId, id, branchId, db);
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    const variant = await db.productVariant.findUnique({ where: { id } });
    if (!variant) continue;
    await db.productVariant.update({
      where: { id },
      data: { stockQty: variant.stockQty - take },
    });
    movements.push({ productId, variantId: id, quantity: take });
    remaining -= take;
  }

  if (remaining > 0) {
    const firstId = ids[0]?.id;
    if (firstId == null) throw new Error(`No variants for product ${productId}`);
    const variant = await db.productVariant.findUnique({ where: { id: firstId } });
    if (!variant) throw new Error(`Variant ${firstId} not found`);
    await db.productVariant.update({
      where: { id: firstId },
      data: { stockQty: variant.stockQty - remaining },
    });
    movements.push({ productId, variantId: firstId, quantity: remaining });
  }

  await syncProductStockFromVariants(productId, db);
  return movements;
}

/**
 * Reduce stock when a sales order line is placed or increased.
 * Never blocks on available quantity — balances may go negative.
 * Inventory logs for the branch are written separately in orders routes.
 */
export async function decrementProductStockForOrder(
  productId: number,
  quantity: number,
  db: Db = prisma,
  variantId?: number | null,
): Promise<StockMovement[]> {
  if (quantity <= 0) return [];

  const count = await db.productVariant.count({ where: { productId } });
  if (count === 0) {
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error(`Product ${productId} not found`);
    await db.product.update({
      where: { id: productId },
      data: { stockQty: product.stockQty - quantity },
    });
    return [{ productId, variantId: null, quantity }];
  }

  let targetVariantId = variantId ?? null;
  if (targetVariantId == null) {
    if (count === 1) {
      const only = await db.productVariant.findFirst({
        where: { productId },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      targetVariantId = only?.id ?? null;
    }
    if (targetVariantId == null) {
      throw new Error(`Select a variant for product ${productId}`);
    }
  }

  const variant = await db.productVariant.findFirst({
    where: { id: targetVariantId, productId },
  });
  if (!variant) {
    throw new Error(`Variant ${targetVariantId} is not valid for product ${productId}`);
  }

  await db.productVariant.update({
    where: { id: targetVariantId },
    data: { stockQty: variant.stockQty - quantity },
  });
  await syncProductStockFromVariants(productId, db);
  return [{ productId, variantId: targetVariantId, quantity }];
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
      data: { stockQty: quantity },
    });
    return [{ productId, variantId: null, quantity }];
  }
  if (variantId != null) {
    const variant = await db.productVariant.findFirst({ where: { id: variantId, productId } });
    if (!variant) throw new Error(`Variant ${variantId} is not valid for product ${productId}`);
    await db.productVariant.update({
      where: { id: variantId },
      data: { stockQty: quantity },
    });
    await syncProductStockFromVariants(productId, db);
    return [{ productId, variantId, quantity }];
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
  const targetFirst = quantity - others;
  await db.productVariant.update({
    where: { id: first.id },
    data: { stockQty: targetFirst },
  });
  await syncProductStockFromVariants(productId, db);
  return [{ productId, variantId: first.id, quantity: targetFirst }];
}
