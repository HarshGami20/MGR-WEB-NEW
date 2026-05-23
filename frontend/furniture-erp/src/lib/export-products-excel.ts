import { downloadExcelWorkbook } from "@/lib/download-excel";
import { exportDateFilename, exportDateQueryString, type ExportDateFilter } from "@/lib/export-query";

export type ProductsExportFilter = ExportDateFilter & {
  search?: string;
  categoryId?: number | null;
  lowStock?: boolean;
};

export function productsExportQueryString(filter: ProductsExportFilter): string {
  const params = new URLSearchParams(exportDateQueryString(filter).replace(/^\?/, ""));
  if (filter.search?.trim()) params.set("search", filter.search.trim());
  if (filter.categoryId != null) params.set("categoryId", String(filter.categoryId));
  if (filter.lowStock) params.set("lowStock", "true");
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function downloadProductsExcel(
  products: Record<string, string | number>[],
  variants: Record<string, string | number>[],
  filter: ProductsExportFilter,
): void {
  const sheets = [{ name: "Products", rows: products, wideColumns: ["Description", "Attributes"] }];
  if (variants.length > 0) {
    sheets.push({ name: "Variants", rows: variants, wideColumns: ["Attributes"] });
  }
  downloadExcelWorkbook(sheets, exportDateFilename("products", filter));
}
