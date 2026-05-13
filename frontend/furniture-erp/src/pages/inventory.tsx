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
  getGetLowStockProductsQueryKey
} from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useBranch } from "@/lib/branch-context";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, AlertTriangle, ArrowDownToLine, ArrowUpToLine, RefreshCw, ChevronsUpDown, Check } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "in" | "out" | "adjustment">("all");
  const [filterSource, setFilterSource] = useState<"all" | "manual" | "order" | "product" | "variant" | "other">("all");

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { selectedBranchId } = useBranch();

  const { data: logsData, isLoading } = useListInventoryLogs({
    page,
    limit: 10,
    type: filterType !== "all" ? filterType : undefined,
    branchId: selectedBranchId ?? undefined,
  });

  const { data: lowStockData } = useGetLowStockProducts();
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
  const selectedVariantId = Number(form.watch("variantId") ?? 0);

  const { data: variantsData, isLoading: variantsLoading } = useListProductVariants(
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
            {new Date(row.original.createdAt).toLocaleString()}
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground">Manage stock levels and track movements</p>
        </div>
        <Button onClick={() => openAdjustDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          Adjust Stock
        </Button>
      </div>

      {lowStockData && lowStockData.length > 0 && (
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <CardTitle className="text-red-700 text-lg">Low Stock Alerts ({lowStockData.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {lowStockData.map((item) => (
                <div key={item.id} className="flex items-center justify-between bg-white p-3 rounded-md border border-red-100 shadow-sm">
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{item.name}</span>
                    <span className="text-xs text-muted-foreground">SKU: {item.sku}</span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="destructive">Stock: {item.stockQty}</Badge>
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => openAdjustDialog(item.id)}>
                      Restock
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg border">
        <div className="flex flex-1 gap-4 items-center">
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
        </div>
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <DataTable
          columns={columns}
          data={filteredLogs}
          isLoading={isLoading}
          emptyMessage="No inventory history found for selected filters."
          footer={<DataTablePaginationFooter page={page} total={logsData?.total ?? 0} limit={logsData?.limit ?? 10} onPageChange={setPage} itemLabel="logs" />}
        />
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Adjust Inventory</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              
              <FormField
                control={form.control}
                name="productId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product</FormLabel>
                    <FormControl>
                      <Popover open={productPickerOpen} onOpenChange={setProductPickerOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={productPickerOpen}
                            className="w-full justify-between font-normal"
                          >
                            {field.value && field.value > 0
                              ? (() => {
                                  const selected = productOptions.find((p) => p.id === Number(field.value));
                                  return selected ? `${selected.name} (${selected.sku})` : "Select product";
                                })()
                              : "Select product"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[360px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search product by name or SKU..." />
                            <CommandList>
                              <CommandEmpty>No product found.</CommandEmpty>
                              <CommandGroup>
                                {productOptions.map((p) => (
                                  <CommandItem
                                    key={p.id}
                                    value={`${p.name} ${p.sku}`}
                                    onSelect={() => {
                                      field.onChange(p.id);
                                      form.setValue("variantId", null);
                                      setProductPickerOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        Number(field.value) === p.id ? "opacity-100" : "opacity-0",
                                      )}
                                    />
                                    <span className="truncate">{p.name}</span>
                                    <span className="ml-2 text-xs text-muted-foreground font-mono">{p.sku}</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {hasVariants && (
                <FormField
                  control={form.control}
                  name="variantId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Variant</FormLabel>
                      <Select
                        value={field.value != null ? String(field.value) : ""}
                        onValueChange={(val) => field.onChange(val ? parseInt(val, 10) : null)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={variantsLoading ? "Loading variants..." : "Select variant"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {variants.map((v: any) => (
                            <SelectItem key={v.id} value={String(v.id)}>
                              {v.name} ({v.sku}) · Stock {v.stockQty}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

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