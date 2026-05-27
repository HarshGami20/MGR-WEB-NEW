import type { ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isStickyRightColumn, tableRowWithStickyActionsClassName, tableStickyCellClassName, tableStickyHeadClassName } from "@/lib/table-sticky";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type DataTableColumnMeta = {
  headerClassName?: string;
  cellClassName?: string;
  /** Set false to disable default one-line ellipsis behavior for primitive cell values. */
  truncate?: boolean;
  /** Pin column on the right when the table scrolls horizontally. Defaults to true for id `actions`. */
  stickyRight?: boolean;
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

type DataTablePaginationFooterProps = {
  page: number;
  total: number;
  limit: number;
  onPageChange: (updater: (prev: number) => number) => void;
  itemLabel?: string;
};

export function DataTablePaginationFooter({
  page,
  total,
  limit,
  onPageChange,
  itemLabel = "items",
}: DataTablePaginationFooterProps) {
  if (!limit || total <= limit) return null;

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="flex items-center justify-between border-t border-border/60 px-6 py-4 text-sm text-muted-foreground">
      <span className="hidden xl:block">
        Page {page} of {totalPages} · Showing {from} to {to} of {total} {itemLabel}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="rounded-lg" onClick={() => onPageChange((p) => Math.max(1, p - 1))} disabled={page === 1}>
          <ChevronLeft className="h-4 w-4 block md:hidden" />
          <span className="hidden md:inline">
          Previous
          </span>
        </Button>
        <div className="items-center gap-1 flex">
          {pageNumbers.map((n) => (
            <Button
              key={n}
              variant={n === page ? "default" : "outline"}
              size="sm"
              className="h-8 min-w-8 rounded-md px-2"
              onClick={() => onPageChange(() => n)}
            >
              {n}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="rounded-lg" onClick={() => onPageChange((p) => p + 1)} disabled={page >= totalPages}>
          <ChevronRight className="h-4 w-4 block md:hidden" />
          <span className="hidden md:inline">
          Next
          </span>
        </Button>
      </div>
    </div>
  );
}

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
                const stickyRight = isStickyRightColumn(header.column.id, meta);
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "h-12 px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground first:pl-6 last:pr-6",
                      meta?.headerClassName,
                      stickyRight && tableStickyHeadClassName(),
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
              <TableRow key={row.id} className={tableRowWithStickyActionsClassName("border-b border-border/60")}>
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as DataTableColumnMeta | undefined;
                  const stickyRight = isStickyRightColumn(cell.column.id, meta);
                  const rawValue = cell.getValue();
                  const shouldTruncatePrimitive = meta?.truncate !== false && (typeof rawValue === "string" || typeof rawValue === "number");
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "px-4 py-3 align-middle first:pl-6 last:pr-6",
                        meta?.cellClassName,
                        stickyRight && tableStickyCellClassName(),
                      )}
                    >
                      {shouldTruncatePrimitive ? (
                        <span
                          className="block max-w-full truncate whitespace-nowrap"
                          title={String(rawValue)}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </span>
                      ) : (
                        flexRender(cell.column.columnDef.cell, cell.getContext())
                      )}
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
