import { downloadExcelWorkbook } from "@/lib/download-excel";
import { exportDateFilename, exportDateQueryString, type ExportDateFilter } from "@/lib/export-query";

export type OrdersExportFilterType = ExportDateFilter["type"];
export type OrdersExportFilter = ExportDateFilter & {
  branchId?: number | null;
  categoryId?: number | null;
};

export type OrderExportRow = Record<string, string | number>;

export function downloadOrdersExcel(rows: OrderExportRow[], filter: OrdersExportFilter): void {
  downloadExcelWorkbook(
    [
      {
        name: "Orders",
        rows,
        wideColumns: ["Line Items", "Payments", "Address", "Staff Comments", "Delivery Comments", "Site Photo Comments"],
      },
    ],
    exportDateFilename("orders", filter),
  );
}

export function ordersExportQueryString(filter: OrdersExportFilter): string {
  const params = new URLSearchParams(exportDateQueryString(filter).replace(/^\?/, ""));
  if (filter.branchId != null) params.set("branchId", String(filter.branchId));
  if (filter.categoryId != null) params.set("categoryId", String(filter.categoryId));
  const s = params.toString();
  return s ? `?${s}` : "";
}
