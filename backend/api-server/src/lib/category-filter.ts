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
