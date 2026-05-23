import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTablePaginationFooter } from "@/components/data-table";
import {
  useListInventoryLogs,
  useAdjustInventory,
  useGetLowStockProducts,
  useListProducts,
  useListProductVariants,
  getListInventoryLogsQueryKey,
  getListProductsQueryKey,
  getGetLowStockProductsQueryKey,
  type Product,
} from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useBranch } from "@/lib/branch-context";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import ProductVariantSelect from "@/components/product-variant-select";
import { Plus, AlertTriangle, ArrowDownToLine, ArrowUpToLine, RefreshCw } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ListDateRangeFilter } from "@/components/list-date-range-filter";
import { type DateRangeValue, dateRangeToCreatedParams } from "@/lib/list-date-filter";
import { ListCategoryFilter } from "@/components/list-category-filter";
import { categoryIdToParam } from "@/lib/list-category-filter";
import { InventoryExportDialog } from "@/components/inventory-export-dialog";
import { usePermissions } from "@/lib/permissions";
import { formatIndianDateTime } from "@/lib/format-datetime";

const adjustSchema = z.object({
  productId: z.coerce.number().min(1, "Product is required"),
  variantId: z.coerce.number().optional().nullable(),
  type: z.enum(["in", "out", "adjustment"]),
  quantity: z.coerce.number().min(1, "Quantity must be positive"),
  notes: z.string().optional().nullable(),
});

type AdjustFormValues = z.infer<typeof adjustSchema>;

export default function Inventory() {
  const [page, setPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "in" | "out" | "adjustment">("all");
  const [filterSource, setFilterSource] = useState<"all" | "manual" | "order" | "product" | "variant" | "other">("all");
  const [logDateRange, setLogDateRange] = useState<DateRangeValue>({});
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [showLowStock, setShowLowStock] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { can } = usePermissions();
  const { selectedBranchId } = useBranch();

  const listLogsParams = useMemo(
    () => ({
      page,
      limit: 10,
      type: filterType !== "all" ? filterType : undefined,
      branchId: selectedBranchId ?? undefined,
      ...dateRangeToCreatedParams(logDateRange),
      ...categoryIdToParam(categoryId),
    }),
    [page, filterType, selectedBranchId, logDateRange.from, logDateRange.to, categoryId],
  );

  const { data: logsData, isLoading } = useListInventoryLogs(
    listLogsParams as Parameters<typeof useListInventoryLogs>[0],
  );

  const { data: lowStockData, isLoading: lowStockLoading } = useGetLowStockProducts();
  const lowStockItems = lowStockData ?? [];
  const { data: productsData } = useListProducts({ page: 1, limit: 500 });
  const productOptions = productsData?.data ?? [];

  const adjustInventory = useAdjustInventory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListInventoryLogsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetLowStockProductsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        toast({ title: "Inventory adjusted successfully" });
        setPage(1);
        setIsDialogOpen(false);
      },
      onError: (e: any) => {
        toast({ title: "Failed to adjust inventory", description: e.message, variant: "destructive" });
      }
    }
  });

  const form = useForm<AdjustFormValues>({
    resolver: zodResolver(adjustSchema),
    defaultValues: {
      productId: 0,
      variantId: null,
      type: "in",
      quantity: 1,
      notes: "",
    },
  });

  const selectedProductId = Number(form.watch("productId") ?? 0);
  const selectedVariantId = form.watch("variantId");

  const { data: variantsData } = useListProductVariants(
    selectedProductId > 0 ? selectedProductId : (undefined as any),
    { query: { enabled: selectedProductId > 0 } }
  );
  const variants = variantsData ?? [];
  const hasVariants = variants.length > 0;

  const openAdjustDialog = (productId?: number) => {
    form.reset({
      productId: productId || 0,
      variantId: null,
      type: "in",
      quantity: 1,
      notes: "",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: AdjustFormValues) => {
    if (hasVariants && !data.variantId) {
      form.setError("variantId", { message: "Variant is required for this product" });
      return;
    }
    adjustInventory.mutate({ data });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "in": return <ArrowDownToLine className="h-4 w-4 text-green-500" />;
      case "out": return <ArrowUpToLine className="h-4 w-4 text-red-500" />;
      case "adjustment": return <RefreshCw className="h-4 w-4 text-blue-500" />;
      default: return null;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "in": return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Stock In</Badge>;
      case "out": return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Stock Out</Badge>;
      case "adjustment": return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Adjustment</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  const getLogSource = (notes?: string | null): "manual" | "order" | "product" | "variant" | "other" => {
    const n = (notes || "").toLowerCase();
    if (!n) return "manual";
    if (n.includes("order ")) return "order";
    if (n.includes("variant")) return "variant";
    if (n.includes("product")) return "product";
    if (n.includes("restock") || n.includes("damaged") || n.includes("manual")) return "manual";
    return "other";
  };

  const getSourceBadge = (source: ReturnType<typeof getLogSource>) => {
    switch (source) {
      case "manual":
        return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">Manual</Badge>;
      case "order":
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Order</Badge>;
      case "product":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Product</Badge>;
      case "variant":
        return <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">Variant</Badge>;
      default:
        return <Badge variant="outline">Other</Badge>;
    }
  };

  const logs = logsData?.data ?? [];
  const filteredLogs =
    filterSource === "all"
      ? logs
      : logs.filter((log) => getLogSource(log.notes) === filterSource);

  const columns = useMemo<ColumnDef<(typeof logs)[number]>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "Date",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatIndianDateTime(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "product",
        header: "Product",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium truncate">
              {row.original.product?.name || "Unknown Product"}
            </div>
            {(row.original as any).variant?.name ? (
              <div className="text-xs text-muted-foreground truncate">
                Variant: {(row.original as any).variant.name}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {getTypeIcon(row.original.type)}
            {getTypeBadge(row.original.type)}
          </div>
        ),
      },
      {
        id: "source",
        header: "Source",
        cell: ({ row }) => getSourceBadge(getLogSource(row.original.notes)),
      },
      {
        accessorKey: "quantity",
        header: () => <span className="text-right block w-full">Quantity</span>,
        meta: { headerClassName: "text-right", cellClassName: "text-right font-medium" },
        cell: ({ row }) =>
          `${row.original.type === "out" ? "-" : "+"}${row.original.quantity}`,
      },
      {
        accessorKey: "notes",
        header: "Notes",
        cell: ({ row }) => {
          const n = row.original.notes || "";
          return (
            <span className="text-muted-foreground text-sm max-w-[200px] truncate block" title={n || undefined}>
              {n || "—"}
            </span>
          );
        },
      },
    ],
    [getTypeIcon, getTypeBadge],
  );

  const lowStockColumns = useMemo<ColumnDef<Product>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Product",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: "sku",
        header: "SKU",
        cell: ({ row }) => (
          <span className="font-mono text-sm text-muted-foreground">{row.original.sku}</span>
        ),
      },
      {
        accessorKey: "stockQty",
        header: () => <span className="text-right block w-full">Current stock</span>,
        meta: { headerClassName: "text-right", cellClassName: "text-right" },
        cell: ({ row }) => (
          <Badge variant="destructive" className="tabular-nums">
            {row.original.stockQty}
          </Badge>
        ),
      },
      {
        accessorKey: "lowStockThreshold",
        header: () => <span className="text-right block w-full">Threshold</span>,
        meta: { headerClassName: "text-right", cellClassName: "text-right text-muted-foreground" },
        cell: ({ row }) => row.original.lowStockThreshold,
      },
      {
        id: "actions",
        header: () => (
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="outline" onClick={() => openAdjustDialog()}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Adjust Stock
            </Button>
          </div>
        ),
        meta: { headerClassName: "text-right w-[140px]", cellClassName: "text-right" },
        cell: ({ row }) => (
          <Button type="button" size="sm" variant="secondary" onClick={() => openAdjustDialog(row.original.id)}>
            Restock
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground">Manage stock levels and track movements</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can("inventory", "view") ? (
            <InventoryExportDialog categoryId={categoryId} movementType={filterType} />
          ) : null}
          <Button onClick={() => openAdjustDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Adjust Stock
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 bg-card p-4 rounded-lg border">
        <div className="flex flex-1 flex-wrap gap-4 items-center">
          <ListDateRangeFilter
            context="inventory"
            value={logDateRange}
            onChange={(next) => {
              setLogDateRange(next);
              setPage(1);
            }}
          />
          <ListCategoryFilter
            value={categoryId}
            onChange={(next) => {
              setCategoryId(next);
              setPage(1);
            }}
          />
          <Select
            value={filterType}
            onValueChange={(val: any) => { setFilterType(val); setPage(1); }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Movements</SelectItem>
              <SelectItem value="in">Stock In</SelectItem>
              <SelectItem value="out">Stock Out</SelectItem>
              <SelectItem value="adjustment">Adjustments</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filterSource}
            onValueChange={(val: any) => { setFilterSource(val); setPage(1); }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="order">Order</SelectItem>
              <SelectItem value="product">Product</SelectItem>
              <SelectItem value="variant">Variant</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant={showLowStock ? "default" : "outline"}
            className={cn(
              "h-9 shrink-0",
              !showLowStock && lowStockItems.length > 0 && "border-red-300 text-red-700 hover:bg-red-50",
            )}
            onClick={() => setShowLowStock((prev) => !prev)}
          >
            <AlertTriangle className="mr-2 h-4 w-4" />
            Low Stock
            {lowStockItems.length > 0 ? (
              <Badge
                variant={showLowStock ? "secondary" : "destructive"}
                className="ml-2 h-5 min-w-5 px-1.5 tabular-nums"
              >
                {lowStockItems.length}
              </Badge>
            ) : null}
          </Button>
        </div>
      </div>

      {showLowStock ? (
        <div className="rounded-lg border border-red-200 bg-red-50/30 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-red-200/80 bg-red-50/60 px-4 py-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
            <h3 className="text-base font-semibold text-red-800">
              Low Stock Alerts
              {lowStockItems.length > 0 ? ` (${lowStockItems.length})` : ""}
            </h3>
          </div>
          <DataTable
            columns={lowStockColumns}
            data={lowStockItems}
            isLoading={lowStockLoading}
            emptyMessage="No low stock products."
            className="border-0 shadow-none rounded-none"
            tableClassName="bg-card"
          />
        </div>
      ) : (
        <div className="bg-card rounded-lg border shadow-sm">
          <DataTable
            columns={columns}
            data={filteredLogs}
            isLoading={isLoading}
            emptyMessage="No inventory history found for selected filters."
            footer={
              <DataTablePaginationFooter
                page={page}
                total={logsData?.total ?? 0}
                limit={logsData?.limit ?? 10}
                onPageChange={setPage}
                itemLabel="logs"
              />
            }
          />
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px] overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Adjust Inventory</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="min-w-0 w-full space-y-4 overflow-x-hidden">
              
              <ProductVariantSelect
                products={productOptions as Product[]}
                productId={selectedProductId}
                variantId={selectedVariantId}
                onProductChange={(pid) => {
                  form.setValue("productId", pid, { shouldDirty: true, shouldValidate: true });
                  form.setValue("variantId", null, { shouldDirty: true, shouldValidate: true });
                }}
                onVariantChange={(vid) =>
                  form.setValue("variantId", vid, { shouldDirty: true, shouldValidate: true })
                }
                onPriceChange={() => {}}
              />
              {form.formState.errors.productId?.message ? (
                <p className="text-sm font-medium text-destructive">
                  {form.formState.errors.productId.message}
                </p>
              ) : null}
              {form.formState.errors.variantId?.message ? (
                <p className="text-sm font-medium text-destructive">
                  {form.formState.errors.variantId.message}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Movement Type</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="in">Stock In (+)</SelectItem>
                          <SelectItem value="out">Stock Out (-)</SelectItem>
                          <SelectItem value="adjustment">Adjustment (+/-)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes / Reason</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} placeholder="E.g., Damaged goods, Restock" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={adjustInventory.isPending}>
                  Save Adjustment
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}