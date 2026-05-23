import type { Prisma } from "@prisma/client";
import { inventoryLogProductInCategories, loadCategoryNodes, productMatchesCategoryFilter, resolveCategoryFilterIds } from "./category-filter";
import { formatExportDateTime } from "./export-datetime";
import { prisma, toNumber } from "./prisma";

export type InventoryLogExportRow = Record<string, string | number>;
export type StockSnapshotExportRow = Record<string, string | number>;

function logSource(notes: string | null | undefined): string {
  const n = (notes ?? "").toLowerCase();
  if (n.includes("order")) return "order";
  if (n.includes("variant")) return "variant";
  if (n.includes("product")) return "product";
  if (n.includes("manual") || n.includes("adjust")) return "manual";
  return "other";
}

export async function buildInventoryLogExportRows(options: {
  type?: string;
  branchId?: number | null;
  categoryIds?: number[] | null;
  createdAt?: { gte?: Date; lt?: Date };
}): Promise<InventoryLogExportRow[]> {
  const where: Prisma.InventoryLogWhereInput = {};
  if (options.type && options.type !== "all") where.type = options.type;
  if (options.branchId != null && options.branchId > 0) where.branchId = options.branchId;

  if (options.createdAt?.gte || options.createdAt?.lt) {
    where.createdAt = {};
    if (options.createdAt.gte) where.createdAt.gte = options.createdAt.gte;
    if (options.createdAt.lt) where.createdAt.lt = options.createdAt.lt;
  }

  if (options.categoryIds?.length) {
    Object.assign(where, inventoryLogProductInCategories(options.categoryIds));
  }

  const logs = await prisma.inventoryLog.findMany({
    where,
    include: {
      product: { include: { category: true } },
      variant: true,
      branch: { select: { name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return logs.map((log) => ({
    "Log ID": log.id,
    Date: formatExportDateTime(log.createdAt),
    Product: log.product.name,
    "Product SKU": log.product.sku,
    Variant: log.variant?.name ?? "",
    "Variant SKU": log.variant?.sku ?? "",
    Type: log.type,
    Quantity: log.type === "out" ? -log.quantity : log.quantity,
    Branch: log.branch?.name ?? "",
    Source: logSource(log.notes),
    Notes: log.notes ?? "",
  }));
}

export async function buildStockSnapshotExportRows(options: {
  categoryIds?: number[] | null;
  lowStockOnly?: boolean;
}): Promise<StockSnapshotExportRow[]> {
  const allCats = await loadCategoryNodes();
  const parentById = new Map(allCats.filter((c) => !c.parentId).map((c) => [c.id, c.name]));

  let products = await prisma.product.findMany({
    include: {
      category: true,
      variants: { where: { isActive: true }, orderBy: [{ name: "asc" }] },
      _count: { select: { variants: true } },
    },
    orderBy: [{ name: "asc" }],
  });

  if (options.categoryIds?.length) {
    products = products.filter((p) =>
      options.categoryIds!.some((fid) => productMatchesCategoryFilter(p.categoryId, fid, allCats)),
    );
  }

  const rows: StockSnapshotExportRow[] = [];

  for (const p of products) {
    const cat = p.category;
    const category =
      cat == null
        ? ""
        : cat.parentId && parentById.get(cat.parentId)
          ? `${parentById.get(cat.parentId)} · ${cat.name}`
          : cat.name;

    if (p._count.variants === 0) {
      const low = p.stockQty <= p.lowStockThreshold;
      if (options.lowStockOnly && !low) continue;
      rows.push({
        "Product SKU": p.sku,
        Product: p.name,
        Category: category,
        Variant: "",
        "Variant SKU": "",
        "Stock Qty": p.stockQty,
        Threshold: p.lowStockThreshold,
        "Low Stock": low ? "Yes" : "No",
        "Price (₹)": toNumber(p.price),
      });
      continue;
    }

    for (const v of p.variants) {
      const low = v.stockQty <= v.lowStockThreshold;
      if (options.lowStockOnly && !low) continue;
      rows.push({
        "Product SKU": p.sku,
        Product: p.name,
        Category: category,
        Variant: v.name,
        "Variant SKU": v.sku,
        "Stock Qty": v.stockQty,
        Threshold: v.lowStockThreshold,
        "Low Stock": low ? "Yes" : "No",
        "Price (₹)": v.price != null ? toNumber(v.price) : toNumber(p.price),
      });
    }
  }

  return rows;
}

export async function resolveInventoryExportCategoryIds(categoryIdParam?: string): Promise<number[] | null> {
  return resolveCategoryFilterIds(categoryIdParam);
}
