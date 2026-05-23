import * as XLSX from "xlsx";

export type ExcelSheet = {
  name: string;
  rows: Record<string, string | number>[];
  wideColumns?: string[];
};

export function downloadExcelWorkbook(sheets: ExcelSheet[], filename: string): void {
  const nonEmpty = sheets.filter((s) => s.rows.length > 0);
  if (!nonEmpty.length) {
    throw new Error("No data found for the selected filter.");
  }

  const wb = XLSX.utils.book_new();
  for (const sheet of nonEmpty) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows);
    const headers = Object.keys(sheet.rows[0] ?? {});
    ws["!cols"] = headers.map((h) => {
      if (sheet.wideColumns?.includes(h) || h.includes("Comment") || h === "Description" || h === "Notes") {
        return { wch: 36 };
      }
      if (h.includes("Name") || h === "Product" || h === "Line Items") return { wch: 22 };
      return { wch: 14 };
    });
    const safeName = sheet.name.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }
  XLSX.writeFile(wb, filename);
}
