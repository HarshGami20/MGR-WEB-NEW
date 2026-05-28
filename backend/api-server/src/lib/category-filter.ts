import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type CategoryNode = { id: number; parentId: number | null; name: string };

export async function loadCategoryNodes(): Promise<CategoryNode[]> {
  return prisma.category.findMany({ select: { id: true, parentId: true, name: true } });
}

/** Parent category filter includes direct children. */
export function expandCategoryFilterIds(filterId: number, allCats: CategoryNode[]): number[] {
  const ids = new Set<number>([filterId]);
  for (const c of allCats) {
    if (c.parentId === filterId) ids.add(c.id);
  }
  return [...ids];
}

export async function resolveCategoryFilterIds(categoryIdParam: string | undefined): Promise<number[] | undefined> {
  if (!categoryIdParam?.trim()) return undefined;
  const fid = parseInt(categoryIdParam, 10);
  if (!Number.isFinite(fid) || fid <= 0) return undefined;
  const allCats = await loadCategoryNodes();
  return expandCategoryFilterIds(fid, allCats);
}

export function productCategoryIdIn(ids: number[]): Prisma.ProductWhereInput {
  return { categoryId: { in: ids } };
}

export function orderHasProductInCategories(ids: number[]): Prisma.OrderWhereInput {
  return {
    items: {
      some: {
        product: { categoryId: { in: ids } },
      },
    },
  };
}

/** Match orders by Order category field only (set on create/edit — not line items). */
export function orderMatchesCategoryFilter(ids: number[]): Prisma.OrderWhereInput {
  return { categoryId: { in: ids } };
}

export function categoryNodeById(nodes: CategoryNode[]): Map<number, CategoryNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

/** Walk parent chain to the top-level (main) category id. */
export function resolveMainCategoryId(
  categoryId: number | null | undefined,
  byId: Map<number, CategoryNode>,
): number | null {
  if (categoryId == null) return null;
  let cur = byId.get(categoryId);
  if (!cur) return null;
  while (cur.parentId != null) {
    const parent = byId.get(cur.parentId);
    if (!parent) break;
    cur = parent;
  }
  return cur.id;
}

export function mainCategoryName(
  mainCategoryId: number | null,
  byId: Map<number, CategoryNode>,
): string {
  if (mainCategoryId == null) return "Uncategorized";
  return byId.get(mainCategoryId)?.name ?? "Uncategorized";
}

/** Parse order body categoryId; must reference an existing main category (parentId null). */
export async function parseOrderCategoryId(raw: unknown): Promise<number | null | "invalid"> {
  if (raw === null || raw === undefined || raw === "" || raw === "none") return null;
  const id = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(id) || id <= 0) return "invalid";
  const cat = await prisma.category.findUnique({
    where: { id },
    select: { id: true, parentId: true },
  });
  if (!cat) return "invalid";
  if (cat.parentId != null) return "invalid";
  return cat.id;
}

export function purchaseOrderHasProductInCategories(ids: number[]): Prisma.PurchaseOrderWhereInput {
  return {
    items: {
      some: {
        productId: { not: null },
        product: { categoryId: { in: ids } },
      },
    },
  };
}

export function complaintInCategories(ids: number[]): Prisma.ComplaintWhereInput {
  return {
    OR: [
      { product: { categoryId: { in: ids } } },
      { order: orderHasProductInCategories(ids) },
      { purchaseOrder: purchaseOrderHasProductInCategories(ids) },
    ],
  };
}

export function inventoryLogProductInCategories(ids: number[]): Prisma.InventoryLogWhereInput {
  return { product: { categoryId: { in: ids } } };
}

export function productMatchesCategoryFilter(
  productCategoryId: number | null,
  filterId: number,
  allCats: CategoryNode[],
): boolean {
  if (productCategoryId == null) return false;
  return expandCategoryFilterIds(filterId, allCats).includes(productCategoryId);
}
