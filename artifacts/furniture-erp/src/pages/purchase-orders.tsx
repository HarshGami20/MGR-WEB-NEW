import { useState } from "react";
import { 
  useListPurchaseOrders, 
  useCreatePurchaseOrder, 
  useUpdatePurchaseOrderStatus,
  useListSuppliers,
  useListManufacturers,
  useListProducts,
  getListPurchaseOrdersQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Eye, Trash2 } from "lucide-react";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const poItemSchema = z.object({
  productId: z.coerce.number().min(1, "Product is required"),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  unitPrice: z.coerce.number().min(0, "Price must be positive"),
});

const poSchema = z.object({
  type: z.enum(["supplier", "manufacturer"]),
  supplierId: z.coerce.number().optional().nullable(),
  manufacturerId: z.coerce.number().optional().nullable(),
  items: z.array(poItemSchema).min(1, "At least one item is required"),
  expectedDelivery: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type POFormValues = z.infer<typeof poSchema>;

export default function PurchaseOrders() {
  const [type, setType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: poData, isLoading } = useListPurchaseOrders({
    type: type !== "all" ? (type as any) : undefined,
    status: status !== "all" ? (status as any) : undefined,
    page,
    limit: 10,
  });

  const { data: suppliersData } = useListSuppliers({ limit: 100 });
  const { data: manufacturersData } = useListManufacturers({ limit: 100 });
  const { data: productsData } = useListProducts({ limit: 1000 });

  const createPO = useCreatePurchaseOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        toast({ title: "Purchase Order created successfully" });
        setIsDialogOpen(false);
      },
    },
  });

  const updateStatus = useUpdatePurchaseOrderStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        toast({ title: "PO status updated" });
      },
    },
  });

  const form = useForm<POFormValues>({
    resolver: zodResolver(poSchema),
    defaultValues: {
      type: "supplier",
      supplierId: undefined,
      manufacturerId: undefined,
      items: [{ productId: 0, quantity: 1, unitPrice: 0 }],
      expectedDelivery: "",
      notes: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const openCreateDialog = () => {
    form.reset({
      type: "supplier",
      supplierId: undefined,
      manufacturerId: undefined,
      items: [{ productId: 0, quantity: 1, unitPrice: 0 }],
      expectedDelivery: "",
      notes: "",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: POFormValues) => {
    if (data.type === "supplier" && !data.supplierId) {
      form.setError("supplierId", { message: "Supplier is required" });
      return;
    }
    if (data.type === "manufacturer" && !data.manufacturerId) {
      form.setError("manufacturerId", { message: "Manufacturer is required" });
      return;
    }
    
    // Clean up IDs based on type
    if (data.type === "supplier") data.manufacturerId = undefined;
    if (data.type === "manufacturer") data.supplierId = undefined;
    
    createPO.mutate({ data });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending</Badge>;
      case "confirmed": return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Confirmed</Badge>;
      case "in_production": return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">In Production</Badge>;
      case "shipped": return <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">Shipped</Badge>;
      case "delivered": return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Delivered</Badge>;
      case "cancelled": return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Cancelled</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const watchType = form.watch("type");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Purchase Orders</h2>
          <p className="text-muted-foreground">Manage orders to suppliers and manufacturers</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Create PO
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-4 rounded-lg border">
        <Select value={type} onValueChange={(val) => { setType(val); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="PO Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="supplier">Supplier</SelectItem>
            <SelectItem value="manufacturer">Manufacturer</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(val) => { setStatus(val); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="in_production">In Production</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO #</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount (₹)</TableHead>
              <TableHead>Expected</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell>
              </TableRow>
            ) : poData?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No purchase orders found.</TableCell>
              </TableRow>
            ) : (
              poData?.data?.map((po: any) => (
                <TableRow key={po.id}>
                  <TableCell className="font-mono text-sm font-medium">{po.poNumber}</TableCell>
                  <TableCell className="capitalize">{po.type}</TableCell>
                  <TableCell className="font-medium">
                    {po.type === "supplier" ? po.supplier?.name : po.manufacturer?.name}
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={po.status} 
                      onValueChange={(val: any) => updateStatus.mutate({ id: po.id, data: { status: val } })}
                    >
                      <SelectTrigger className="h-8 w-[140px] border-none bg-transparent shadow-none p-0 focus:ring-0">
                        {getStatusBadge(po.status)}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="in_production">In Production</SelectItem>
                        <SelectItem value="shipped">Shipped</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right font-medium">₹{po.totalAmount.toLocaleString()}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString() : "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        
        {poData && poData.total > poData.limit && (
          <div className="p-4 border-t flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Showing {(page - 1) * poData.limit + 1} to {Math.min(page * poData.limit, poData.total)} of {poData.total} POs
            </span>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * poData.limit >= poData.total}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Purchase Order</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PO Type</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="supplier">Supplier (Ready Goods)</SelectItem>
                          <SelectItem value="manufacturer">Manufacturer (Custom)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {watchType === "supplier" ? (
                  <FormField
                    control={form.control}
                    name="supplierId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Supplier</FormLabel>
                        <Select
                          value={field.value ? field.value.toString() : ""}
                          onValueChange={(val) => field.onChange(parseInt(val))}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Supplier" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {suppliersData?.data?.map(s => (
                              <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={form.control}
                    name="manufacturerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Manufacturer</FormLabel>
                        <Select
                          value={field.value ? field.value.toString() : ""}
                          onValueChange={(val) => field.onChange(parseInt(val))}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Manufacturer" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {manufacturersData?.data?.map(m => (
                              <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Items</h4>
                  <Button type="button" variant="outline" size="sm" onClick={() => append({ productId: 0, quantity: 1, unitPrice: 0 })}>
                    <Plus className="h-4 w-4 mr-2" /> Add Item
                  </Button>
                </div>
                
                {fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2 items-start border p-3 rounded-md">
                    <div className="flex-1 space-y-4">
                      <FormField
                        control={form.control}
                        name={`items.${index}.productId`}
                        render={({ field: productField }) => (
                          <FormItem>
                            <FormLabel className="sr-only">Product</FormLabel>
                            <Select
                              value={productField.value ? productField.value.toString() : ""}
                              onValueChange={(val) => productField.onChange(parseInt(val))}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select Product" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {productsData?.data?.map(p => (
                                  <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name={`items.${index}.quantity`}
                          render={({ field: qtyField }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Quantity</FormLabel>
                              <FormControl>
                                <Input type="number" min="1" {...qtyField} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.unitPrice`}
                          render={({ field: priceField }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Cost Price (₹)</FormLabel>
                              <FormControl>
                                <Input type="number" min="0" step="0.01" {...priceField} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="mt-1" disabled={fields.length === 1}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="expectedDelivery"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expected Delivery Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createPO.isPending}>
                  Create PO
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

    </div>
  );
}