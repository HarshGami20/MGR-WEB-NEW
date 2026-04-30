import { useState } from "react";
import { 
  useListInventoryLogs, 
  useAdjustInventory, 
  useGetLowStockProducts, 
  getListInventoryLogsQueryKey,
  getListProductsQueryKey,
  getGetLowStockProductsQueryKey
} from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, AlertTriangle, ArrowDownToLine, ArrowUpToLine, RefreshCw } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const adjustSchema = z.object({
  productId: z.coerce.number().min(1, "Product is required"),
  type: z.enum(["in", "out", "adjustment"]),
  quantity: z.coerce.number().min(1, "Quantity must be positive"),
  notes: z.string().optional().nullable(),
});

type AdjustFormValues = z.infer<typeof adjustSchema>;

export default function Inventory() {
  const [page, setPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "in" | "out" | "adjustment">("all");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: logsData, isLoading } = useListInventoryLogs({
    page,
    limit: 10,
    type: filterType !== "all" ? filterType : undefined
  });

  const { data: lowStockData } = useGetLowStockProducts();

  const adjustInventory = useAdjustInventory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListInventoryLogsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetLowStockProductsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        toast({ title: "Inventory adjusted successfully" });
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
      type: "in",
      quantity: 1,
      notes: "",
    },
  });

  const openAdjustDialog = (productId?: number) => {
    form.reset({
      productId: productId || 0,
      type: "in",
      quantity: 1,
      notes: "",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: AdjustFormValues) => {
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
        </div>
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell>
              </TableRow>
            ) : logsData?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No inventory logs found.</TableCell>
              </TableRow>
            ) : (
              logsData?.data?.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium">{log.product?.name || "Unknown Product"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getTypeIcon(log.type)}
                      {getTypeBadge(log.type)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {log.type === "out" ? "-" : "+"}{log.quantity}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate" title={log.notes || ""}>
                    {log.notes || "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        
        {logsData && logsData.total > logsData.limit && (
          <div className="p-4 border-t flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Showing {(page - 1) * logsData.limit + 1} to {Math.min(page * logsData.limit, logsData.total)} of {logsData.total} logs
            </span>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * logsData.limit >= logsData.total}>
                Next
              </Button>
            </div>
          </div>
        )}
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
                    <FormLabel>Product ID</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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