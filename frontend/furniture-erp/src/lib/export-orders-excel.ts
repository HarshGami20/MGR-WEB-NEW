import * as XLSX from "xlsx";

export type OrdersExportFilterType = "all" | "year" | "month" | "custom";

export type OrdersExportFilter = {
  type: OrdersExportFilterType;
  year?: string;
  month?: string;
  startDate?: string;
  endDate?: string;
  branchId?: number | null;
  categoryId?: number | null;
};

export type OrderExportRow = Record<string, string | number>;

function buildQuery(filter: OrdersExportFilter): string {
  const params = new URLSearchParams();
  params.set("filter", filter.type);
  if (filter.type === "year" || filter.type === "month") {
    if (filter.year) params.set("year", filter.year);
  }
  if (filter.type === "month" && filter.month) {
    params.set("month", filter.month);
  }
  if (filter.type === "custom") {
    if (filter.startDate) params.set("startDate", filter.startDate);
    if (filter.endDate) params.set("endDate", filter.endDate);
  }
  if (filter.branchId != null) params.set("branchId", String(filter.branchId));
  if (filter.categoryId != null) params.set("categoryId", String(filter.categoryId));
  const s = params.toString();
  return s ? `?${s}` : "";
}

function exportFilename(filter: OrdersExportFilter): string {
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  if (filter.type === "all") return "orders_all.xlsx";
  if (filter.type === "year" && filter.year) return `orders_${filter.year}.xlsx`;
  if (filter.type === "month" && filter.year && filter.month) {
    const name = monthNames[parseInt(filter.month, 10) - 1] ?? filter.month;
    return `orders_${name}_${filter.year}.xlsx`;
  }
  if (filter.type === "custom" && filter.startDate && filter.endDate) {
    return `orders_${filter.startDate}_to_${filter.endDate}.xlsx`;
  }
  return `orders_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
}

export function downloadOrdersExcel(rows: OrderExportRow[], filter: OrdersExportFilter): void {
  if (!rows.length) {
    throw new Error("No orders found for the selected filter.");
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  const headers = Object.keys(rows[0] ?? {});
  ws["!cols"] = headers.map((h) => {
    if (h.includes("Comment") || h === "Line Items" || h === "Payments" || h === "Address") {
      return { wch: 36 };
    }
    if (h === "Order Number" || h === "Customer Name") return { wch: 18 };
    return { wch: 14 };
  });
  XLSX.utils.book_append_sheet(wb, ws, "Orders");
  XLSX.writeFile(wb, exportFilename(filter));
}

export function ordersExportQueryString(filter: OrdersExportFilter): string {
  return buildQuery(filter);
}
