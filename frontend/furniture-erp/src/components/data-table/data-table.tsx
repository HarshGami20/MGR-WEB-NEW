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
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { getPaginationPageItems } from "@/lib/pagination";

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
  const pageItems = getPaginationPageItems(page, totalPages);

  return (
    <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <span className="text-xs sm:text-sm">
        <span className="hidden lg:inline">
          Page {page} of {totalPages} · Showing {from} to {to} of {total} {itemLabel}
        </span>
        <span className="lg:hidden">
          Page {page} of {totalPages}
          <span className="hidden sm:inline">
            {" "}
            · {from}–{to} of {total}
          </span>
        </span>
      </span>
      <div className="flex items-center justify-center gap-1 sm:justify-end sm:gap-2">
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={() => onPageChange((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden md:inline">Previous</span>
        </Button>
        <div className="flex max-w-[min(100%,16rem)] items-center justify-center gap-1 overflow-x-auto px-1 sm:max-w-none">
          {pageItems.map((item, index) =>
            item === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground"
                aria-hidden
              >
                <MoreHorizontal className="h-4 w-4" />
              </span>
            ) : (
              <Button
                key={item}
                variant={item === page ? "default" : "outline"}
                size="sm"
                className="h-8 min-w-8 shrink-0 rounded-md px-2"
                onClick={() => onPageChange(() => item)}
                aria-label={`Page ${item}`}
                aria-current={item === page ? "page" : undefined}
              >
                {item}
              </Button>
            ),
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={() => onPageChange((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <span className="hidden md:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
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
