import type { ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataTableColumnMeta = {
  headerClassName?: string;
  cellClassName?: string;
};

/** TanStack Table wrapper with consistent ERP list styling, loading/empty rows, and optional footer (e.g. pagination). */
type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  emptyMessage?: string;
  footer?: ReactNode;
  getRowId?: (originalRow: TData, index: number) => string;
  /** Classes for the outer wrapper around the table */
  className?: string;
  tableClassName?: string;
};

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  emptyMessage = "No results.",
  footer,
  getRowId,
  className,
  tableClassName,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getRowId ?? ((row, i) => {
      const r = row as Record<string, unknown>;
      if (r.id != null) return String(r.id);
      return String(i);
    }),
  });

  const colCount = columns.length;

  return (
    <div className={cn("w-full", className, tableClassName)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-b border-border/70 hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                const meta = header.column.columnDef.meta as DataTableColumnMeta | undefined;
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "h-12 px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground first:pl-6 last:pr-6",
                      meta?.headerClassName,
                    )}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={colCount} className="h-32 text-center text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          ) : table.getRowModel().rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={colCount} className="h-28 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="border-b border-border/60">
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as DataTableColumnMeta | undefined;
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn("px-4 py-3 align-middle first:pl-6 last:pr-6", meta?.cellClassName)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {footer}
    </div>
  );
}
