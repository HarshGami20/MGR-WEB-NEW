import { useState } from "react";
import { Download } from "lucide-react";
import { customFetch } from "@/api-client/custom-fetch";
import { useListBranches } from "@/api-client";
import { useBranch } from "@/lib/branch-context";
import {
  downloadInventoryExcel,
  inventoryExportQueryString,
  type InventoryExportFilter,
} from "@/lib/export-inventory-excel";
import type { ExportDateFilterType } from "@/lib/export-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ListCategoryFilter } from "@/components/list-category-filter";
import { ExportDateFields } from "@/components/export-date-fields";
import { useToast } from "@/hooks/use-toast";

type InventoryExportDialogProps = {
  categoryId?: number;
  movementType?: "all" | "in" | "out" | "adjustment";
  triggerClassName?: string;
};

export function InventoryExportDialog({
  categoryId,
  movementType = "all",
  triggerClassName,
}: InventoryExportDialogProps) {
  const { toast } = useToast();
  const { selectedBranchId } = useBranch();
  const { data: branchesData } = useListBranches({ isActive: true, limit: 100 });
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [filterType, setFilterType] = useState<ExportDateFilterType>("all");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exportBranchId, setExportBranchId] = useState<number | null>(selectedBranchId);
  const [exportCategoryId, setExportCategoryId] = useState<number | undefined>(categoryId);
  const [exportType, setExportType] = useState<"all" | "in" | "out" | "adjustment">(movementType);
  const [exportLowStock, setExportLowStock] = useState(false);
  const [includeStock, setIncludeStock] = useState(true);

  const handleExport = async () => {
    if (filterType === "custom" && (!startDate || !endDate)) {
      toast({ title: "Select start and end dates", variant: "destructive" });
      return;
    }
    setExporting(true);
    try {
      const filter: InventoryExportFilter = {
        type: filterType,
        year: filterType === "year" || filterType === "month" ? year : undefined,
        month: filterType === "month" ? month : undefined,
        startDate: filterType === "custom" ? startDate : undefined,
        endDate: filterType === "custom" ? endDate : undefined,
        branchId: exportBranchId,
        categoryId: exportCategoryId ?? null,
        movementType: exportType,
        lowStock: exportLowStock,
        includeStock,
      };
      const res = await customFetch<{
        movementCount: number;
        stockCount: number;
        movements: Record<string, string | number>[];
        stock: Record<string, string | number>[];
      }>(`/api/reports/inventory-export${inventoryExportQueryString(filter)}`);
      downloadInventoryExcel(res.movements, res.stock, filter);
      toast({
        title: "Export successful",
        description: `${res.movementCount} movement(s)${res.stockCount ? `, ${res.stockCount} stock row(s)` : ""} exported.`,
      });
      setOpen(false);
    } catch (e: unknown) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Could not export inventory.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setExportBranchId(selectedBranchId);
          setExportCategoryId(categoryId);
          setExportType(movementType);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className={triggerClassName}>
          <Download className="mr-2 h-4 w-4" />
          Export to Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Export Inventory to Excel</DialogTitle>
          <DialogDescription>
            Downloads stock movements and a current stock snapshot as Excel sheets (.xlsx).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select
                value={exportBranchId?.toString() ?? "all"}
                onValueChange={(v) => setExportBranchId(v === "all" ? null : parseInt(v, 10))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {(branchesData?.data ?? []).map((b: { id: number; name: string }) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Movement type</Label>
              <Select value={exportType} onValueChange={(v) => setExportType(v as typeof exportType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="in">Stock in</SelectItem>
                  <SelectItem value="out">Stock out</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <ListCategoryFilter value={exportCategoryId} onChange={setExportCategoryId} triggerClassName="w-full" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Switch id="include-stock" checked={includeStock} onCheckedChange={setIncludeStock} />
              <Label htmlFor="include-stock" className="cursor-pointer">
                Include current stock sheet
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="export-inv-low-stock"
                checked={exportLowStock}
                onCheckedChange={setExportLowStock}
                disabled={!includeStock}
              />
              <Label htmlFor="export-inv-low-stock" className="cursor-pointer">
                Stock sheet: low stock only
              </Label>
            </div>
          </div>
          <ExportDateFields
            filterType={filterType}
            onFilterTypeChange={setFilterType}
            year={year}
            onYearChange={setYear}
            month={month}
            onMonthChange={setMonth}
            startDate={startDate}
            onStartDateChange={setStartDate}
            endDate={endDate}
            onEndDateChange={setEndDate}
          />
          <p className="text-xs text-muted-foreground">
            Movement date filter applies to the log sheet only. Leave as &quot;All dates&quot; for full history.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={exporting}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleExport()} disabled={exporting}>
            {exporting ? "Exporting…" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
