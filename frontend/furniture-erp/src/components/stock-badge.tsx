import { cn } from "@/lib/utils";
import type { StockStatus } from "@/lib/product-branch-stock";

const labels: Record<StockStatus, string> = {
  in_stock: "In Stock",
  low_stock: "Low Stock",
  out_of_stock: "Out of Stock",
};

const styles: Record<StockStatus, string> = {
  in_stock: "bg-emerald-50 text-emerald-700",
  low_stock: "bg-amber-50 text-amber-700",
  out_of_stock: "bg-red-50 text-red-700",
};

export function StockBadge({
  status,
  qty,
  className,
}: {
  status: StockStatus;
  qty?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        styles[status],
        className,
      )}
    >
      {labels[status]}
      {qty !== undefined ? ` · ${qty}` : ""}
    </span>
  );
}
