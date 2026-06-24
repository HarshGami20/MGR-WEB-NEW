import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export type BranchStockRow = {
  branchId: number | null;
  branchName: string;
  stockQty: number;
};

type InventoryLogLike = {
  type: string;
  quantity: number;
};

function netQtyFromLogs(logs: InventoryLogLike[]): number {
  let qty = 0;
  for (const log of logs) {
    if (log.type === "in") qty += log.quantity;
    else if (log.type === "out") qty -= log.quantity;
    else if (log.type === "adjustment") qty = log.quantity;
  }
  return qty;
}

/** On-hand quantity for one product/variant SKU at a branch (inventory logs are source of truth). */
export async function getBranchStockQty(
  productId: number,
  variantId: number | null,
  branchId: number,
  db: Db = prisma,
): Promise<number> {
  const logs = await db.inventoryLog.findMany({
    where: {
      productId,
      branchId,
      variantId: variantId ?? null,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { type: true, quantity: true },
  });
  return netQtyFromLogs(logs);
}

/** Per-variant stock from inventory logs (all branches). */
export async function branchStockByVariant(variantIds: number[]): Promise<Map<number, BranchStockRow[]>> {
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
    rows.push({ ...branch, stockQty: qty });
    result.set(variantId, rows);
  }

  for (const rows of result.values()) {
    rows.sort((a, b) => a.branchName.localeCompare(b.branchName));
  }

  return result;
}

export type BranchInventorySummary = {
  totalStockQty: number;
  /** Product / variant SKUs with on-hand stock at this branch. */
  skuCount: number;
};

/** Net on-hand units at one branch from inventory logs (all products and variants). */
export async function branchInventorySummary(branchId: number): Promise<BranchInventorySummary> {
  const logs = await prisma.inventoryLog.findMany({
    where: { branchId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const stockBySku = new Map<string, number>();
  for (const log of logs) {
    const skuKey = `${log.productId}:${log.variantId ?? "product"}`;
    const current = stockBySku.get(skuKey) ?? 0;
    if (log.type === "in") {
      stockBySku.set(skuKey, current + log.quantity);
    } else if (log.type === "out") {
      stockBySku.set(skuKey, current - log.quantity);
    } else if (log.type === "adjustment") {
      stockBySku.set(skuKey, log.quantity);
    }
  }

  let totalStockQty = 0;
  let skuCount = 0;
  for (const qty of stockBySku.values()) {
    const onHand = Math.max(0, qty);
    if (onHand > 0) {
      totalStockQty += onHand;
      skuCount += 1;
    }
  }

  return { totalStockQty, skuCount };
}
