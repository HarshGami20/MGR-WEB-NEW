import { useState } from "react";
import { 
  useListPayments, 
  useCreatePayment,
  useListOrders,
  getListPaymentsQueryKey
} from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Receipt } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";

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

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: paymentsData, isLoading } = useListPayments({
    page,
    limit: 10,
  });

  const { data: ordersData } = useListOrders({
    status: "confirmed" as any, // Only get active orders
    limit: 100,
  });

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
    setIsDialogOpen(true);
  };

  const onSubmit = (data: PaymentFormValues) => {
    createPayment.mutate({ data });
  };

  const handleOrderSelect = (orderIdStr: string) => {
    const orderId = parseInt(orderIdStr);
    form.setValue("orderId", orderId);
    
    const order = ordersData?.data?.find(o => o.id === orderId);
    if (order) {
      setSelectedOrderDetails(order);
      // Auto-fill amount with remaining balance
      form.setValue("amount", order.totalAmount - order.paidAmount);
    }
  };

  const getModeBadge = (mode: string) => {
    switch (mode) {
      case "cash": return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Cash</Badge>;
      case "bank_transfer": return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Bank Transfer</Badge>;
      case "upi": return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">UPI</Badge>;
      default: return <Badge variant="outline">{mode}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Payments</h2>
          <p className="text-muted-foreground">Record and track order payments</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Record Payment
        </Button>
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Order #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Payment Mode</TableHead>
              <TableHead className="text-right">Amount (₹)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell>
              </TableRow>
            ) : paymentsData?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No payments found.</TableCell>
              </TableRow>
            ) : (
              paymentsData?.data?.map((payment: any) => (
                <TableRow key={payment.id}>
                  <TableCell className="text-muted-foreground">
                    {new Date(payment.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{payment.order?.orderNumber}</TableCell>
                  <TableCell className="font-medium">{payment.order?.customerName}</TableCell>
                  <TableCell>{getModeBadge(payment.mode)}</TableCell>
                  <TableCell className="text-right font-bold text-green-600">
                    +₹{payment.amount.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        
        {paymentsData && paymentsData.total > paymentsData.limit && (
          <div className="p-4 border-t flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Showing {(page - 1) * paymentsData.limit + 1} to {Math.min(page * paymentsData.limit, paymentsData.total)} of {paymentsData.total} payments
            </span>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * paymentsData.limit >= paymentsData.total}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
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
                    <Select
                      value={field.value ? field.value.toString() : ""}
                      onValueChange={handleOrderSelect}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Order" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ordersData?.data?.map(o => (
                          <SelectItem key={o.id} value={o.id.toString()}>
                            {o.orderNumber} - {o.customerName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                      <FormLabel>Amount (₹)</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" step="0.01" {...field} />
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