import { useState } from "react";
import { Download } from "lucide-react";
import { customFetch } from "@/api-client/custom-fetch";
import {
  downloadProductsExcel,
  productsExportQueryString,
  type ProductsExportFilter,
} from "@/lib/export-products-excel";
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ListCategoryFilter } from "@/components/list-category-filter";
import { ExportDateFields } from "@/components/export-date-fields";
import { useToast } from "@/hooks/use-toast";

type ProductsExportDialogProps = {
  search?: string;
  categoryId?: number;
  lowStock?: boolean;
  triggerClassName?: string;
};

export function ProductsExportDialog({
  search,
  categoryId,
  lowStock,
  triggerClassName,
}: ProductsExportDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [filterType, setFilterType] = useState<ExportDateFilterType>("all");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exportSearch, setExportSearch] = useState(search ?? "");
  const [exportCategoryId, setExportCategoryId] = useState<number | undefined>(categoryId);
  const [exportLowStock, setExportLowStock] = useState(!!lowStock);

  const handleExport = async () => {
    if (filterType === "custom" && (!startDate || !endDate)) {
      toast({ title: "Select start and end dates", variant: "destructive" });
      return;
    }
    setExporting(true);
    try {
      const filter: ProductsExportFilter = {
        type: filterType,
        year: filterType === "year" || filterType === "month" ? year : undefined,
        month: filterType === "month" ? month : undefined,
        startDate: filterType === "custom" ? startDate : undefined,
        endDate: filterType === "custom" ? endDate : undefined,
        search: exportSearch.trim() || undefined,
        categoryId: exportCategoryId ?? null,
        lowStock: exportLowStock,
      };
      const res = await customFetch<{
        productCount: number;
        variantCount: number;
        products: Record<string, string | number>[];
        variants: Record<string, string | number>[];
      }>(`/api/reports/products-export${productsExportQueryString(filter)}`);
      downloadProductsExcel(res.products, res.variants, filter);
      toast({
        title: "Export successful",
        description: `${res.productCount} product(s)${res.variantCount ? `, ${res.variantCount} variant(s)` : ""} exported to Excel.`,
      });
      setOpen(false);
    } catch (e: unknown) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Could not export products.",
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
          setExportSearch(search ?? "");
          setExportCategoryId(categoryId);
          setExportLowStock(!!lowStock);
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
          <DialogTitle>Export Products to Excel</DialogTitle>
          <DialogDescription>
            Downloads an Excel workbook with Products (category, sub category) and a Variants sheet for variant SKUs and stock. Uses your filters below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Search</Label>
            <Input
              placeholder="Name or SKU"
              value={exportSearch}
              onChange={(e) => setExportSearch(e.target.value)}
            />
          </div>
          <div className="space-y-2 grid">
            <Label>Category</Label>
            <ListCategoryFilter value={exportCategoryId} onChange={setExportCategoryId} triggerClassName="w-full" />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="export-low-stock" checked={exportLowStock} onCheckedChange={setExportLowStock} />
            <Label htmlFor="export-low-stock" className="cursor-pointer">
              Low stock only
            </Label>
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
