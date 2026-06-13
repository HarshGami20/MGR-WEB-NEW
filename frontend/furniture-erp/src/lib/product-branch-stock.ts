export type BranchStock = {
  branchId: number | null;
  branchName: string;
  stockQty: number;
};

export type VariantWithBranchStock = {
  branchStocks?: BranchStock[];
  stockQty?: number;
};

export function branchStockTotal(stocks: BranchStock[]): number {
  return stocks.reduce((sum, branch) => sum + branch.stockQty, 0);
}

export function branchStockQtyAt(
  stocks: BranchStock[] | undefined,
  selectedBranchId: number | null | undefined,
): number {
  if (selectedBranchId == null) return 0;
  for (const row of stocks ?? []) {
    if (row.branchId != null && Number(row.branchId) === selectedBranchId) {
      return Math.max(0, Math.floor(Number(row.stockQty ?? 0)));
    }
  }
  return 0;
}

export function aggregateBranchStocksFromVariants<T extends VariantWithBranchStock>(
  variants: T[],
): BranchStock[] {
  const byKey = new Map<string, BranchStock>();
  for (const variant of variants) {
    for (const branch of variant.branchStocks ?? []) {
      const key = branch.branchId != null ? String(branch.branchId) : "unassigned";
      const existing = byKey.get(key);
      if (existing) {
        existing.stockQty += branch.stockQty;
      } else {
        byKey.set(key, { ...branch });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => a.branchName.localeCompare(b.branchName));
}

export function variantDisplayStock(
  variant: VariantWithBranchStock,
  selectedBranchId: number | null | undefined,
): number {
  const branchStocks = Array.isArray(variant.branchStocks) ? variant.branchStocks : [];
  if (selectedBranchId != null) {
    return branchStockQtyAt(branchStocks, selectedBranchId);
  }
  if (branchStocks.length > 0) return branchStockTotal(branchStocks);
  return variant.stockQty ?? 0;
}

export function resolveProductBranchStockRows(
  productBranchStocks: BranchStock[],
  variants: VariantWithBranchStock[],
  isSingleSku: boolean,
): BranchStock[] {
  if (!isSingleSku && variants.length > 0) {
    const variantAggregated = aggregateBranchStocksFromVariants(variants);
    return variantAggregated.length > 0 ? variantAggregated : productBranchStocks;
  }
  return productBranchStocks;
}

function stockTotalFromRowsOrVariants(
  branchRows: BranchStock[],
  productStockQty: number,
  variants: VariantWithBranchStock[],
  isSingleSku: boolean,
): number {
  if (branchRows.length > 0) return branchStockTotal(branchRows);
  if (!isSingleSku && variants.length > 0) {
    return variants.reduce((sum, variant) => sum + variantDisplayStock(variant, null), 0);
  }
  return Number(productStockQty ?? 0);
}

export type ProductListStockDisplay = {
  qty: number;
  isLow: boolean;
  branchStocks?: BranchStock[];
};

/** Product list stock — all branches = sum of branch rows; one branch = that branch only. */
export function productStockDisplay(
  product: {
    branchStocks?: BranchStock[];
    stockQty?: number;
    lowStockThreshold?: number;
    isLowStock?: boolean;
    variantCount?: number;
    variants?: VariantWithBranchStock[];
  },
  selectedBranchId: number | null | undefined,
): ProductListStockDisplay {
  const productBranchStocks = Array.isArray(product.branchStocks) ? product.branchStocks : [];
  const variants = product.variants ?? [];
  const isSingleSku = (product.variantCount ?? 0) === 0;
  const branchRows = resolveProductBranchStockRows(productBranchStocks, variants, isSingleSku);
  const threshold = product.lowStockThreshold ?? 10;

  if (selectedBranchId != null) {
    const qty = branchStockQtyAt(branchRows, selectedBranchId);
    return { qty, isLow: qty > 0 && qty <= threshold };
  }

  const qty = stockTotalFromRowsOrVariants(
    branchRows,
    product.stockQty ?? 0,
    variants,
    isSingleSku,
  );

  return {
    qty,
    isLow: qty > 0 && (product.isLowStock === true || qty <= threshold),
    branchStocks: branchRows.length > 0 ? branchRows : undefined,
  };
}

export type ProductDetailStockResult = {
  displayStock: number;
  grandTotal: number;
  totalUnitsBranchStocks: BranchStock[];
  isLow: boolean;
};

export function computeProductDetailStock(
  product: { branchStocks?: BranchStock[]; stockQty?: number; lowStockThreshold?: number },
  variants: VariantWithBranchStock[],
  isSingleSku: boolean,
  selectedBranchId: number | null | undefined,
): ProductDetailStockResult {
  const productBranchStocks = Array.isArray(product.branchStocks) ? product.branchStocks : [];
  const totalUnitsBranchStocks = resolveProductBranchStockRows(
    productBranchStocks,
    variants,
    isSingleSku,
  );
  const grandTotal = stockTotalFromRowsOrVariants(
    totalUnitsBranchStocks,
    product.stockQty ?? 0,
    variants,
    isSingleSku,
  );

  const displayStock =
    selectedBranchId != null
      ? branchStockQtyAt(totalUnitsBranchStocks, selectedBranchId)
      : grandTotal;

  const threshold = product.lowStockThreshold ?? 10;
  const isLow = displayStock <= threshold && displayStock > 0;

  return { displayStock, grandTotal, totalUnitsBranchStocks, isLow };
}

export function catalogLineMaxQuantity(stockQty: number | undefined): number | undefined {
  if (stockQty === undefined || !Number.isFinite(stockQty)) return undefined;
  return Math.max(0, Math.floor(stockQty));
}

export function clampCatalogLineQuantity(quantity: number, maxQuantity?: number): number {
  const min = 1;
  if (maxQuantity == null) return Math.max(min, quantity);
  if (maxQuantity <= 0) return min;
  return Math.max(min, Math.min(quantity, maxQuantity));
}

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export function stockStatusFromQty(qty: number, threshold = 10): StockStatus {
  if (qty <= 0) return "out_of_stock";
  if (qty <= threshold) return "low_stock";
  return "in_stock";
}

/** Branch stock for order catalog lines — mirrors mobile catalogVariantStock. */
export function catalogVariantStock(
  product: { branchStocks?: BranchStock[]; variantCount?: number },
  variant: VariantWithBranchStock | null | undefined,
  branchId: number | null | undefined,
): number | undefined {
  if (branchId == null) return undefined;
  if (variant) {
    const branchStocks = Array.isArray(variant.branchStocks) ? variant.branchStocks : [];
    if (branchStocks.length > 0) return branchStockQtyAt(branchStocks, branchId);
    if ((product.variantCount ?? 0) <= 1) {
      return branchStockQtyAt(product.branchStocks, branchId);
    }
    return 0;
  }
  return branchStockQtyAt(product.branchStocks, branchId);
}

export type CatalogVariantRow = VariantWithBranchStock & {
  id: number;
  name?: string;
  sku?: string;
  price?: number;
  lowStockThreshold?: number;
};

export type ProductWithBranchStock = {
  branchStocks?: BranchStock[];
  variantCount?: number;
  lowStockThreshold?: number;
  variants?: CatalogVariantRow[];
};

export function resolveCatalogLineStock(
  product: ProductWithBranchStock | undefined,
  variantId: number | null | undefined,
  variants: CatalogVariantRow[] | undefined,
  branchId: number | null | undefined,
): number | undefined {
  if (!product || branchId == null) return undefined;
  const variant =
    variantId != null && variantId > 0
      ? (variants ?? product.variants ?? []).find((v) => v.id === variantId)
      : null;
  if ((product.variantCount ?? 0) > 0 && (variantId == null || variantId <= 0)) {
    return undefined;
  }
  return catalogVariantStock(product, variant, branchId);
}

export function validateCatalogLineItemsStock(
  items: Array<{
    isCustom?: boolean;
    productId?: number | null;
    variantId?: number | null;
    quantity?: number;
  }>,
  products: Array<ProductWithBranchStock & { id: number; name: string }>,
  branchId: number | null | undefined,
  getVariants: (productId: number) => CatalogVariantRow[] | undefined,
): string | null {
  if (branchId == null) return null;
  for (const item of items) {
    if (item.isCustom) continue;
    const pid = Number(item.productId);
    if (!pid) continue;
    const product = products.find((p) => p.id === pid);
    const variants = getVariants(pid);
    const stockQty = resolveCatalogLineStock(product, item.variantId, variants, branchId);
    const max = catalogLineMaxQuantity(stockQty);
    const name = product?.name ?? "Product";
    if (max === 0) return `"${name}" is out of stock at this branch.`;
    if (max != null && Number(item.quantity) > max) {
      return `"${name}" exceeds available stock (max ${max}).`;
    }
  }
  return null;
}
