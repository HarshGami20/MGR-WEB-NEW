import { cn } from "@/lib/utils";
import { branchStockTotal, type BranchStock } from "@/lib/product-branch-stock";

export function BranchStockBreakdown({
  branchStocks,
  selectedBranchId,
  allBranchesTotal,
  align = "right",
  className,
}: {
  branchStocks: BranchStock[];
  selectedBranchId: number | null | undefined;
  allBranchesTotal?: number;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  if (branchStocks.length === 0) return null;

  const total = allBranchesTotal ?? branchStockTotal(branchStocks);
  const alignClass =
    align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start";

  return (
    <div className={cn("space-y-0.5 text-xs text-muted-foreground", className)}>
      {selectedBranchId != null ? (
        <div className={cn("flex items-center gap-1", alignClass)}>
          <span>All branches:</span>
          <span className="font-mono text-foreground">{total}</span>
        </div>
      ) : null}
      {branchStocks.map((branch) => {
        const isSelected =
          selectedBranchId != null &&
          branch.branchId != null &&
          Number(branch.branchId) === selectedBranchId;
        return (
          <div
            key={branch.branchId ?? "unassigned"}
            className={cn("flex items-center gap-2 whitespace-nowrap", alignClass)}
          >
            <span
              className={cn("max-w-[100px] truncate", isSelected && "font-medium text-foreground")}
              title={branch.branchName}
            >
              {branch.branchName}
            </span>
            <span
              className={cn(
                "font-mono text-foreground",
                isSelected && "font-semibold text-primary",
                branch.stockQty < 0 && "text-destructive",
              )}
            >
              {branch.stockQty}
            </span>
          </div>
        );
      })}
    </div>
  );
}
