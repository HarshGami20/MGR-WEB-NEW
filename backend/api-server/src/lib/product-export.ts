import type { Prisma } from "@prisma/client";
import { loadCategoryNodes, productMatchesCategoryFilter, resolveCategoryFilterIds } from "./category-filter";
import { formatExportDateTime } from "./export-datetime";
import { prisma, toNumber } from "./prisma";

export type ProductExportRow = Record<string, string | number>;
export type VariantExportRow = Record<string, string | number>;

function categoryPath(category: { name: string; parentId: number | null } | null, parentName?: string): string {
  if (!category) return "";
  if (parentName) return `${parentName} · ${category.name}`;
  return category.name;
}

function parseAttributes(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(o)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
  } catch {
    return raw;
  }
}

export async function buildProductExportRows(options: {
  search?: string;
  categoryIds?: number[] | null;
  lowStockOnly?: boolean;
  createdAt?: { gte?: Date; lt?: Date };
}): Promise<{ products: ProductExportRow[]; variants: VariantExportRow[] }> {
  const allCats = await loadCategoryNodes();
  const parentById = new Map(allCats.filter((c) => !c.parentId).map((c) => [c.id, c.name]));

  const where: Prisma.ProductWhereInput = {};
  if (options.createdAt?.gte || options.createdAt?.lt) {
    where.createdAt = {};
    if (options.createdAt.gte) where.createdAt.gte = options.createdAt.gte;
    if (options.createdAt.lt) where.createdAt.lt = options.createdAt.lt;
  }

  let products = await prisma.product.findMany({
    where,
    include: {
      category: true,
      variants: { orderBy: [{ name: "asc" }, { id: "asc" }] },
      _count: { select: { variants: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  if (options.search?.trim()) {
    const q = options.search.trim().toLowerCase();
    products = products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
    );
  }

  if (options.categoryIds?.length) {
    products = products.filter((p) =>
      options.categoryIds!.some((fid) => productMatchesCategoryFilter(p.categoryId, fid, allCats)),
    );
  }

  const idsWithVariants = products.filter((p) => p._count.variants > 0).map((p) => p.id);
  const lowFromVariant = new Map<number, boolean>();
  if (idsWithVariants.length) {
    const vrows = await prisma.productVariant.findMany({
      where: { productId: { in: idsWithVariants } },
      select: { productId: true, stockQty: true, lowStockThreshold: true },
    });
    for (const v of vrows) {
      if (v.stockQty <= v.lowStockThreshold) lowFromVariant.set(v.productId, true);
    }
  }

  const rowIsLow = (p: (typeof products)[0]) => {
    if (p._count.variants === 0) return p.stockQty <= p.lowStockThreshold;
    return !!lowFromVariant.get(p.id);
  };

  if (options.lowStockOnly) {
    products = products.filter(rowIsLow);
  }

  const productRows: ProductExportRow[] = [];
  const variantRows: VariantExportRow[] = [];

  for (const p of products) {
    const cat = p.category;
    const path = categoryPath(cat, cat?.parentId ? parentById.get(cat.parentId) : undefined);
    const hasVariants = p._count.variants > 0;

    productRows.push({
      SKU: p.sku,
      Name: p.name,
      Category: path,
      Description: p.description ?? "",
      "Price (₹)": toNumber(p.price),
      "GST %": toNumber(p.gstPercent),
      "Stock Qty": hasVariants ? "" : p.stockQty,
      "Low Stock Threshold": p.lowStockThreshold,
      "Has Variants": hasVariants ? "Yes" : "No",
      "Variant Count": p._count.variants,
      "Low Stock": rowIsLow(p) ? "Yes" : "No",
      Attributes: parseAttributes(p.attributes),
      "Created At": formatExportDateTime(p.createdAt),
    });

    for (const v of p.variants) {
      variantRows.push({
        "Product SKU": p.sku,
        "Product Name": p.name,
        "Variant Name": v.name,
        "Variant SKU": v.sku,
        "Price (₹)": v.price != null ? toNumber(v.price) : "",
        "Stock Qty": v.stockQty,
        "Low Stock Threshold": v.lowStockThreshold,
        Active: v.isActive ? "Yes" : "No",
        "Low Stock": v.stockQty <= v.lowStockThreshold ? "Yes" : "No",
        Attributes: parseAttributes(v.attributes),
        "Created At": formatExportDateTime(v.createdAt),
      });
    }
  }

  return { products: productRows, variants: variantRows };
}

export async function resolveProductExportCategoryIds(categoryIdParam?: string): Promise<number[] | null> {
  return resolveCategoryFilterIds(categoryIdParam);
}
