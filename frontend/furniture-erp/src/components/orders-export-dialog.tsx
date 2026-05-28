import { useState } from "react";
import { Download } from "lucide-react";
import { customFetch } from "@/api-client/custom-fetch";
import { useListBranches } from "@/api-client";
import { useBranch } from "@/lib/branch-context";
import { downloadOrdersExcel, ordersExportQueryString, type OrdersExportFilter } from "@/lib/export-orders-excel";
import type { ExportDateFilterType } from "@/lib/export-query";
import { ExportDateFields } from "@/components/export-date-fields";
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
import { Input } from "@/components/ui/input";
import { ListCategoryFilter } from "@/components/list-category-filter";
import { useToast } from "@/hooks/use-toast";

type OrdersExportDialogProps = {
  categoryId?: number;
  triggerClassName?: string;
};

export function OrdersExportDialog({ categoryId, triggerClassName }: OrdersExportDialogProps) {
  const { toast } = useToast();
  const { selectedBranchId } = useBranch();
  const { data: branchesData } = useListBranches({ isActive: true, limit: 100 });
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [filterType, setFilterType] = useState<ExportDateFilterType>("year");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exportBranchId, setExportBranchId] = useState<number | null>(selectedBranchId);
  const [exportCategoryId, setExportCategoryId] = useState<number | undefined>(categoryId);

  const handleExport = async () => {
    if (filterType === "custom" && (!startDate || !endDate)) {
      toast({ title: "Select start and end dates", variant: "destructive" });
      return;
    }
    setExporting(true);
    try {
      const filter: OrdersExportFilter = {
        type: filterType,
        year: filterType === "year" || filterType === "month" ? year : undefined,
        month: filterType === "month" ? month : undefined,
        startDate: filterType === "custom" ? startDate : undefined,
        endDate: filterType === "custom" ? endDate : undefined,
        branchId: exportBranchId,
        categoryId: exportCategoryId ?? null,
      };
      const qs = ordersExportQueryString(filter);
      const res = await customFetch<{ count: number; rows: Record<string, string | number>[] }>(
        `/api/reports/orders-export${qs}`,
      );
      downloadOrdersExcel(res.rows, filter);
      toast({
        title: "Export successful",
        description: `${res.count} order(s) exported to Excel.`,
      });
      setOpen(false);
    } catch (e: unknown) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Could not export orders.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className={triggerClassName}>
          <Download className="mr-2 h-4 w-4" />
          Export to Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Export Orders to Excel</DialogTitle>
          <DialogDescription>Choose a filter option to export orders with full details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
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
              <Label>Category</Label>
              <ListCategoryFilter  value={exportCategoryId} onChange={setExportCategoryId} triggerClassName="w-full" />
            </div>
          </div>

    
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
