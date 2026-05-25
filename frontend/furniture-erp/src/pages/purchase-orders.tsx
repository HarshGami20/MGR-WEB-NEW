import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTablePaginationFooter } from "@/components/data-table";
import { 
  useListPurchaseOrders, 
  useCreatePurchaseOrder, 
  useUpdatePurchaseOrderStatus,
  useDeletePurchaseOrder,
  useListSuppliers,
  useListManufacturers,
  useListProducts,
  getListPurchaseOrdersQueryKey,
} from "@/api-client";
import { useBranch, assignedUserBranchIds } from "@/lib/branch-context";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Eye, Trash2 } from "lucide-react";
import { LineItemRow } from "@/components/line-item-row";
import { lineItemFormSchema, lineItemToApiPayload } from "@/lib/line-item-form-schema";
import { defaultCatalogLineItem } from "@/lib/custom-line-item";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/lib/permissions";
import { Input } from "@/components/ui/input";
import { ListDateRangeFilter } from "@/components/list-date-range-filter";
import { type DateRangeValue, dateRangeToCreatedParams } from "@/lib/list-date-filter";
import { formatInr } from "@/lib/format-currency";
import { ListCategoryFilter } from "@/components/list-category-filter";
import { categoryIdToParam } from "@/lib/list-category-filter";
import { formatDisplayDate } from "@/lib/format-datetime";

function todayDateInputValue(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const poSchema = z.object({
  type: z.enum(["supplier", "manufacturer"]),
  supplierId: z.coerce.number().optional().nullable(),
  manufacturerId: z.coerce.number().optional().nullable(),
  items: z.array(lineItemFormSchema).min(1, "At least one item is required"),
  expectedDelivery: z
    .string()
    .optional()
    .nullable()
    .refine((value) => !value || value >= todayDateInputValue(), {
      message: "Expected delivery cannot be in the past",
    }),
  notes: z.string().optional().nullable(),
});

type POFormValues = z.infer<typeof poSchema>;

export default function PurchaseOrders() {
  const [, setLocation] = useLocation();
  const { can } = usePermissions();
  const [type, setType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>({});
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { selectedBranchId } = useBranch();
  const { user } = useAuth();
  const assigned = assignedUserBranchIds(user);
  const writeBranchId =
    assigned.length === 1
      ? assigned[0]!
      : assigned.length > 1
        ? selectedBranchId != null && assigned.includes(selectedBranchId)
          ? selectedBranchId
          : null
        : selectedBranchId;

  const { data: poData, isLoading } = useListPurchaseOrders({
    type: type !== "all" ? (type as any) : undefined,
    status: status !== "all" ? (status as any) : undefined,
    branchId: selectedBranchId ?? undefined,
    ...dateRangeToCreatedParams(dateRange),
    ...categoryIdToParam(categoryId),
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

  const deletePO = useDeletePurchaseOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        toast({ title: "Purchase order deleted" });
      },
      onError: (e: { data?: { error?: string }; message?: string }) =>
        toast({
          title: "Delete failed",
          description: e?.data?.error ?? e?.message,
          variant: "destructive",
        }),
    },
  });

  const form = useForm<POFormValues>({
    resolver: zodResolver(poSchema),
    defaultValues: {
      type: "supplier",
      supplierId: undefined,
      manufacturerId: undefined,
      items: [{ ...defaultCatalogLineItem }],
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
      items: [{ ...defaultCatalogLineItem }],
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

    for (let i = 0; i < data.items.length; i += 1) {
      const item = data.items[i];
      if (item.isCustom) continue;
      const product = productsData?.data?.find((p) => p.id === Number(item.productId));
      if (product?.variantCount && product.variantCount > 0 && !item.variantId) {
        form.setError(`items.${i}.productId`, { message: "Please select a variant for this product" });
        return;
      }
    }
    
    // Clean up IDs based on type
    if (data.type === "supplier") data.manufacturerId = undefined;
    if (data.type === "manufacturer") data.supplierId = undefined;
    
    if (writeBranchId == null) {
      toast({
        title: "Select a branch",
        description: "Choose a working branch in the header before creating a purchase order.",
        variant: "destructive",
      });
      return;
    }

    createPO.mutate({
      data: {
        ...data,
        branchId: writeBranchId,
        items: data.items.map((item) => lineItemToApiPayload(item)) as any,
      },
    });
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

  const pos = (poData?.data ?? []) as any[];

  const columns = useMemo<ColumnDef<(typeof pos)[number]>[]>(
    () => [
      {
        accessorKey: "poNumber",
        header: "PO #",
        cell: ({ row }) => (
          <div
            className="font-mono text-sm font-medium cursor-pointer text-dark hover:underline text-left"
            onClick={() => setLocation(`/purchase-orders/${row.original.id}`)}
          >
            {row.original.poNumber}
          </div>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => <span className="capitalize">{row.original.type}</span>,
      },
      {
        id: "vendor",
        header: "Vendor",
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.type === "supplier"
              ? row.original.supplier?.name
              : row.original.manufacturer?.name}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const po = row.original;
          return can("purchaseOrders", "edit") ? (
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
          ) : (
            getStatusBadge(po.status)
          );
        },
      },
      {
        accessorKey: "totalAmount",
        header: () => <span className="text-right block w-full">Amount (₹)</span>,
        meta: { headerClassName: "text-right", cellClassName: "text-right font-medium" },
        cell: ({ row }) => formatInr(row.original.totalAmount),
      },
      {
        accessorKey: "expectedDelivery",
        header: "Expected",
        cell: ({ row }) =>
          row.original.expectedDelivery ? (
            <span className="text-muted-foreground">
              {formatDisplayDate(row.original.expectedDelivery)}
            </span>
          ) : (
            "—"
          ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { headerClassName: "w-[100px]", cellClassName: "text-right" },
        cell: ({ row }) => {
          const po = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label={`View ${po.poNumber}`}
                onClick={() => setLocation(`/purchase-orders/${po.id}`)}
              >
                <Eye className="h-4 w-4 text-muted-foreground" />
              </Button>
              {can("purchaseOrders", "delete") ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                  aria-label={`Delete ${po.poNumber}`}
                  disabled={deletePO.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        `Delete purchase order ${po.poNumber}?${
                          po.status === "delivered"
                            ? " Stock added on delivery will be reversed."
                            : ""
                        }`,
                      )
                    ) {
                      deletePO.mutate({ id: po.id });
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [can, deletePO, getStatusBadge, setLocation, updateStatus],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Purchase Orders</h2>
          <p className="text-muted-foreground">Manage orders to suppliers and manufacturers</p>
        </div>
        {can("purchaseOrders", "add") && (
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Create PO
        </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-center bg-card p-4 rounded-lg border">
        <ListDateRangeFilter
          context="purchaseOrders"
          value={dateRange}
          onChange={(next) => {
            setDateRange(next);
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
        <DataTable
          columns={columns}
          data={pos}
          isLoading={isLoading}
          emptyMessage="No purchase orders found."
          footer={<DataTablePaginationFooter page={page} total={poData?.total ?? 0} limit={poData?.limit ?? 10} onPageChange={setPage} itemLabel="POs" />}
        />
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-medium">Items</h4>
                  <Button type="button" variant="outline" size="sm" onClick={() => append({ ...defaultCatalogLineItem })}>
                    <Plus className="h-4 w-4 mr-2" /> Add item
                  </Button>
                </div>
                
                {fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2 items-start border p-3 rounded-md">
                    <div className="flex-1">
                      <LineItemRow
                        index={index}
                        form={form}
                        products={productsData?.data ?? []}
                        onlyForLabel="PO"
                      />
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
                        <Input
                          type="date"
                          min={todayDateInputValue()}
                          {...field}
                          value={field.value || ""}
                          onChange={(event) => field.onChange(event.target.value)}
                        />
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