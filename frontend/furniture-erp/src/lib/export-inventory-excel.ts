import { downloadExcelWorkbook } from "@/lib/download-excel";
import { exportDateFilename, exportDateQueryString, type ExportDateFilter } from "@/lib/export-query";

export type InventoryExportFilter = ExportDateFilter & {
  branchId?: number | null;
  categoryId?: number | null;
  movementType?: "all" | "in" | "out" | "adjustment";
  lowStock?: boolean;
  includeStock?: boolean;
};

export function inventoryExportQueryString(filter: InventoryExportFilter): string {
  const params = new URLSearchParams(exportDateQueryString(filter).replace(/^\?/, ""));
  if (filter.branchId != null) params.set("branchId", String(filter.branchId));
  if (filter.categoryId != null) params.set("categoryId", String(filter.categoryId));
  if (filter.movementType && filter.movementType !== "all") params.set("type", filter.movementType);
  if (filter.lowStock) params.set("lowStock", "true");
  if (filter.includeStock === false) params.set("includeStock", "false");
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function downloadInventoryExcel(
  movements: Record<string, string | number>[],
  stock: Record<string, string | number>[],
  filter: InventoryExportFilter,
): void {
  const sheets = [];
  if (stock.length > 0) {
    sheets.push({ name: "Current Stock", rows: stock });
  }
  if (movements.length > 0) {
    sheets.push({ name: "Movements", rows: movements, wideColumns: ["Notes"] });
  }
  downloadExcelWorkbook(sheets, exportDateFilename("inventory", filter));
}
