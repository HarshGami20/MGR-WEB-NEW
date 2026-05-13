import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTablePaginationFooter } from "@/components/data-table";
import { 
  useListPayments, 
  useCreatePayment,
  useListOrders,
  useListBranches,
  getListPaymentsQueryKey
} from "@/api-client";
import { useBranch } from "@/lib/branch-context";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronsUpDown, GitBranch, Plus } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const paymentSchema = z.object({
  orderId: z.coerce.number().min(1, "Order is required"),
  amount: z.coerce.number().min(1, "Amount must be positive"),
  mode: z.enum(["cash", "bank_transfer", "upi"]),
  notes: z.string().optional().nullable(),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

export default function Payments() {
  const [page, setPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<any>(null);
  const [orderPickerOpen, setOrderPickerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"due" | "payments">("due");
  const [paymentsOrderFilter, setPaymentsOrderFilter] = useState("all");

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { selectedBranchId, setSelectedBranchId } = useBranch();
  const { data: branchesData } = useListBranches({ isActive: true, limit: 100 });

  useEffect(() => {
    setPage(1);
  }, [selectedBranchId]);

  const { data: paymentsData, isLoading } = useListPayments({
    page,
    limit: 10,
    ...(paymentsOrderFilter !== "all" ? { orderId: Number(paymentsOrderFilter) } : {}),
    branchId: selectedBranchId ?? undefined,
  });

  const { data: ordersData } = useListOrders({
    limit: 100,
    branchId: selectedBranchId ?? undefined,
  });

  const payableOrders = useMemo(
    () =>
      (ordersData?.data ?? []).filter((order: any) => {
        const remaining = Number(order.totalAmount || 0) - Number(order.paidAmount || 0);
        return remaining > 0;
      }),
    [ordersData?.data],
  );
  const dueOrders = payableOrders;

  const createPayment = useCreatePayment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] }); // invalidate orders list
        toast({ title: "Payment recorded successfully" });
        setIsDialogOpen(false);
      },
    },
  });

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      orderId: 0,
      amount: 0,
      mode: "cash",
      notes: "",
    },
  });

  const openCreateDialog = () => {
    form.reset({
      orderId: 0,
      amount: 0,
      mode: "cash",
      notes: "",
    });
    setSelectedOrderDetails(null);
    setOrderPickerOpen(false);
    setIsDialogOpen(true);
  };

  const onSubmit = (data: PaymentFormValues) => {
    const remaining = selectedOrderDetails
      ? Math.max(0, Number(selectedOrderDetails.totalAmount || 0) - Number(selectedOrderDetails.paidAmount || 0))
      : 0;
    if (selectedOrderDetails && Number(data.amount) > remaining) {
      form.setError("amount", {
        message: `Amount cannot be greater than remaining amount (₹${remaining.toLocaleString()})`,
      });
      return;
    }
    createPayment.mutate({ data });
  };

  const handleOrderSelect = (orderIdStr: string) => {
    const orderId = parseInt(orderIdStr);
    form.setValue("orderId", orderId);
    
    const order = ordersData?.data?.find(o => o.id === orderId);
    if (order) {
      const remaining = Math.max(0, Number(order.totalAmount || 0) - Number(order.paidAmount || 0));
      setSelectedOrderDetails(order);
      // Auto-fill amount with remaining balance
      form.setValue("amount", remaining);
      setOrderPickerOpen(false);
    }
  };

  const getModeBadge = useCallback((mode: string) => {
    switch (mode) {
      case "cash": return <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">Cash</Badge>;
      case "bank_transfer": return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Bank Transfer</Badge>;
      case "upi": return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">UPI</Badge>;
      default: return <Badge variant="outline">{mode}</Badge>;
    }
  }, []);

  const payments = (paymentsData?.data ?? []) as any[];
  const paymentFilterOrderOptions = useMemo(() => ordersData?.data ?? [], [ordersData?.data]);

  const columns = useMemo<ColumnDef<(typeof payments)[number]>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "Date",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleString()}
          </span>
        ),
      },
      {
        id: "orderNum",
        header: "Order #",
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.order?.orderNumber}</span>
        ),
      },
      {
        id: "customer",
        header: "Customer",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.order?.customerName}</span>
        ),
      },
      {
        id: "branch",
        header: "Branch",
        cell: ({ row }) => {
          const b = row.original.order?.branch;
          return b?.name ? (
            <Badge variant="outline" className="flex w-fit max-w-[160px] items-center gap-1 font-normal">
              <GitBranch className="h-3 w-3 shrink-0" />
              <span className="truncate">{b.name}</span>
            </Badge>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          );
        },
      },
      {
        accessorKey: "mode",
        header: "Payment Mode",
        cell: ({ row }) => getModeBadge(row.original.mode),
      },
      {
        accessorKey: "amount",
        header: () => <span className="text-right block w-full">Amount (₹)</span>,
        meta: { headerClassName: "text-right", cellClassName: "text-right font-bold text-green-600" },
        cell: ({ row }) => `+₹${row.original.amount.toLocaleString()}`,
      },
    ],
    [getModeBadge],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Payments</h2>
          <p className="text-muted-foreground">Track due balances and payment history</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Branch</label>
            <Select
              value={selectedBranchId?.toString() ?? "all"}
              onValueChange={(v) => setSelectedBranchId(v === "all" ? null : parseInt(v, 10))}
            >
              <SelectTrigger className="w-[200px]">
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
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Record Payment
          </Button>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as "due" | "payments");
          setPage(1);
        }}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="due">Due Payments</TabsTrigger>
          <TabsTrigger value="payments">All Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="due" className="space-y-4">
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-sm font-medium">Orders With Due Amount</p>
              <Badge variant="outline">{dueOrders.length} due</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-4 py-2 text-left">Order #</th>
                    <th className="px-4 py-2 text-left">Customer</th>
                    <th className="px-4 py-2 text-left">Branch</th>
                    <th className="px-4 py-2 text-right">Total (₹)</th>
                    <th className="px-4 py-2 text-right">Paid (₹)</th>
                    <th className="px-4 py-2 text-right">Remaining (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {dueOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                        No due payments found.
                      </td>
                    </tr>
                  ) : (
                    dueOrders.map((order: any) => {
                      const total = Number(order.totalAmount || 0);
                      const paid = Number(order.paidAmount || 0);
                      const remaining = Math.max(0, total - paid);
                      return (
                        <tr key={order.id} className="border-t">
                          <td className="px-4 py-2 font-mono">{order.orderNumber}</td>
                          <td className="px-4 py-2 font-medium">{order.customerName}</td>
                          <td className="px-4 py-2 text-muted-foreground text-sm">
                            {order.branch?.name ?? "—"}
                          </td>
                          <td className="px-4 py-2 text-right">{total.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right text-green-700">{paid.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right font-semibold text-destructive">{remaining.toLocaleString()}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <div className="flex items-center justify-end">
            <Select
              value={paymentsOrderFilter}
              onValueChange={(value) => {
                setPaymentsOrderFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Filter by order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Orders</SelectItem>
                {paymentFilterOrderOptions.map((order: any) => (
                  <SelectItem key={order.id} value={String(order.id)}>
                    {order.orderNumber} - {order.customerName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-card rounded-lg border shadow-sm">
            <DataTable
              columns={columns}
              data={payments}
              isLoading={isLoading}
              emptyMessage="No payments found."
              footer={<DataTablePaginationFooter page={page} total={paymentsData?.total ?? 0} limit={paymentsData?.limit ?? 10} onPageChange={setPage} itemLabel="payments" />}
            />
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              
              <FormField
                control={form.control}
                name="orderId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order</FormLabel>
                    <FormControl>
                      <Popover open={orderPickerOpen} onOpenChange={setOrderPickerOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={orderPickerOpen}
                            className="w-full justify-between font-normal"
                          >
                            {field.value && field.value > 0
                              ? (() => {
                                  const selected = payableOrders.find((o: any) => o.id === Number(field.value));
                                  if (!selected) return "Select order";
                                  const remaining =
                                    Math.max(0, Number(selected.totalAmount || 0) - Number(selected.paidAmount || 0));
                                  return `${selected.orderNumber} - ${selected.customerName} (Remaining: ₹${remaining.toLocaleString()})`;
                                })()
                              : "Select order"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[520px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search by order number or customer..." />
                            <CommandList>
                              <CommandEmpty>No order found.</CommandEmpty>
                              <CommandGroup>
                                {payableOrders.map((o: any) => {
                                  const remaining =
                                    Math.max(0, Number(o.totalAmount || 0) - Number(o.paidAmount || 0));
                                  return (
                                    <CommandItem
                                      key={o.id}
                                      value={`${o.orderNumber} ${o.customerName}`}
                                      onSelect={() => handleOrderSelect(String(o.id))}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          Number(field.value) === o.id ? "opacity-100" : "opacity-0",
                                        )}
                                      />
                                      <span className="truncate">{o.orderNumber} - {o.customerName}</span>
                                      <span className="ml-auto text-xs text-muted-foreground">
                                        Remaining: ₹{remaining.toLocaleString()}
                                      </span>
                                    </CommandItem>
                                  );
                                })}
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

              {selectedOrderDetails && (
                <div className="bg-muted/50 p-3 rounded-md border text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Order Amount:</span>
                    <span className="font-medium">₹{selectedOrderDetails.totalAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Already Paid:</span>
                    <span className="text-green-600 font-medium">₹{selectedOrderDetails.paidAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t mt-1 font-bold">
                    <span>Balance Due:</span>
                    <span className="text-destructive">₹{(selectedOrderDetails.totalAmount - selectedOrderDetails.paidAmount).toLocaleString()}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {selectedOrderDetails
                          ? `Amount (₹) - Remaining: ₹${Math.max(
                              0,
                              Number(selectedOrderDetails.totalAmount || 0) -
                                Number(selectedOrderDetails.paidAmount || 0),
                            ).toLocaleString()}`
                          : "Amount (₹)"}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          max={
                            selectedOrderDetails
                              ? Math.max(
                                  0,
                                  Number(selectedOrderDetails.totalAmount || 0) -
                                    Number(selectedOrderDetails.paidAmount || 0),
                                )
                              : undefined
                          }
                          step="0.01"
                          {...field}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const value = Number(raw);
                            if (!selectedOrderDetails || !Number.isFinite(value)) {
                              field.onChange(raw);
                              return;
                            }
                            const remaining = Math.max(
                              0,
                              Number(selectedOrderDetails.totalAmount || 0) -
                                Number(selectedOrderDetails.paidAmount || 0),
                            );
                            field.onChange(Math.min(value, remaining));
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Mode</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Mode" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                          <SelectItem value="upi">UPI</SelectItem>
                        </SelectContent>
                      </Select>
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
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} placeholder="Transaction ID, Reference, etc." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createPayment.isPending}>
                  Record Payment
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}