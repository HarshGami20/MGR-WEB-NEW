import { Link, Redirect, useRoute } from "wouter";
import { getGetOrderQueryKey, useCreatePayment, useGetOrder, useListPayments, useUpdateOrder } from "@/api-client";
import { ArrowLeft, ImageIcon, PencilLine, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";

function getStatusBadge(status: string) {
  switch (status) {
    case "order_received":
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Order Received</Badge>;
    case "manufacturing":
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Manufacturing</Badge>;
    case "ready_to_ship":
      return <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">Ready To Ship</Badge>;
    case "delivered":
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Delivered</Badge>;
    case "cancelled":
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Cancelled</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

export default function OrderDetailPage() {
  const [, params] = useRoute("/orders/:id");
  const orderId = params?.id ? parseInt(params.id, 10) : NaN;

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: order, isLoading, isError } = useGetOrder(orderId, {
    query: { enabled: Number.isFinite(orderId) && orderId > 0 },
  });

  const [status, setStatus] = useState("order_received");
  const [paymentStatus, setPaymentStatus] = useState("due");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [newStaffComment, setNewStaffComment] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const updateOrder = useUpdateOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
        toast({ title: "Order updated" });
      },
      onError: (error: any) => toast({ title: "Update failed", description: error?.response?.data?.error ?? error?.message, variant: "destructive" }),
    },
  });
  const createPayment = useCreatePayment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
        queryClient.invalidateQueries({ queryKey: ["listPayments"] });
        setPaymentAmount("");
        setPaymentNote("");
        toast({ title: "Payment added" });
      },
      onError: (error: any) => toast({ title: "Payment failed", description: error?.response?.data?.error ?? error?.message, variant: "destructive" }),
    },
  });
  const { data: paymentsData } = useListPayments({ orderId, limit: 100 }, { query: { enabled: Number.isFinite(orderId) && orderId > 0 } });

  useEffect(() => {
    if (!order) return;
    const orderAny = order as any;
    setStatus(orderAny.status ?? "order_received");
    setPaymentStatus(orderAny.paymentStatus ?? "due");
    setPaymentMode(orderAny.paymentMode ?? "cash");
  }, [order]);

  if (!Number.isFinite(orderId) || orderId <= 0) return <Redirect to="/orders" />;
  if (isLoading) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading order…</div>;
  if (isError || !order) return <div className="text-muted-foreground">Order not found.</div>;

  const orderAny = order as any;
  const payments = paymentsData?.data ?? [];
  const challanImages: string[] = Array.isArray(orderAny.challanImages) ? orderAny.challanImages : [];
  const photoComments = Array.isArray(orderAny.photoComments) ? orderAny.photoComments : [];
  const staffComments = Array.isArray(orderAny.staffComments) ? orderAny.staffComments : [];
  const balance = Math.max(0, order.totalAmount - order.paidAmount);

  const applyStatusUpdate = () => {
    updateOrder.mutate({
      id: order.id,
      data: {
        status,
        paymentStatus,
      } as any,
    });
  };

  const addStaffComment = () => {
    const text = newStaffComment.trim();
    if (!text) return;
    const next = [...staffComments, { comment: text, createdAt: new Date().toISOString() }];
    updateOrder.mutate({
      id: order.id,
      data: { staffComments: next } as any,
    });
    setNewStaffComment("");
  };

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-[hsl(0_0%_97%)] -mx-4 -mt-4 px-4 py-8 md:-mx-8 md:px-8 md:py-10">
      <div className="max-w-4xl space-y-6">
        <Link href="/orders">
          <Button type="button" variant="ghost" className="mb-2 -ml-2 gap-2 text-foreground hover:bg-transparent hover:text-foreground/80">
            <ArrowLeft className="h-4 w-4" />
            Back to orders
          </Button>
        </Link>

        <div className="rounded-xl border border-border/60 bg-white p-5 space-y-5">
          <div className="flex justify-between items-start border-b pb-4">
            <div>
              <h1 className="font-bold text-2xl tracking-tight">{order.orderNumber}</h1>
              <p className="text-sm text-muted-foreground mt-1">{new Date(order.createdAt).toLocaleString()}</p>
            </div>
            {getStatusBadge(order.status)}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-sm font-semibold mb-2">Customer Details</h2>
              <p className="text-sm">{order.customerName}</p>
              <p className="text-sm text-muted-foreground">{order.customerMobile || "—"}</p>
              <p className="text-sm text-muted-foreground">{order.customerAddress || "—"}</p>
              {order.isGst ? <p className="text-sm font-mono mt-2">GST: {order.customerGstNumber || "—"}</p> : null}
            </div>
            <div className="md:text-right">
              <h2 className="text-sm font-semibold mb-2">Payment Summary</h2>
              <p className="text-sm">Total: ₹{order.totalAmount.toLocaleString()}</p>
              <p className="text-sm text-green-600">Paid: ₹{order.paidAmount.toLocaleString()}</p>
              <p className="text-sm font-medium mt-1">Balance: ₹{balance.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Payment status: {orderAny.paymentStatus ?? "due"}</p>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-2">Order Items</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items?.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.product?.name || `Product #${item.productId}`}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">₹{item.unitPrice.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-medium">₹{item.totalPrice.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-xl border border-border/60 p-4 space-y-4">
            <h3 className="text-xl font-semibold flex items-center gap-2"><ImageIcon className="h-5 w-5" /> Challan Images ({challanImages.length})</h3>
            {challanImages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No challan images uploaded.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {challanImages.map((url, index) => (
                  <img
                    key={`${url}-${index}`}
                    src={url}
                    alt={`Challan ${index + 1}`}
                    className="h-24 w-24 rounded-md object-cover border cursor-zoom-in"
                    onClick={() => setPreviewImage(url)}
                  />
                ))}
              </div>
            )}

            {photoComments.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium">Photos and comments</h4>
                {photoComments.map((entry: any, index: number) => (
                  <div key={index} className="rounded-md border p-3">
                    {entry.imageUrl ? (
                      <img
                        src={entry.imageUrl}
                        alt={`Photo ${index + 1}`}
                        className="h-24 w-24 rounded-md object-cover border mb-2 cursor-zoom-in"
                        onClick={() => setPreviewImage(entry.imageUrl)}
                      />
                    ) : null}
                    <p className="text-sm">{entry.comment || "No comment"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border/60 p-4 space-y-4">
            <h3 className="text-xl font-semibold flex items-center gap-2"><UserRound className="h-5 w-5" /> Staff Comments</h3>
            {staffComments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff comments yet.</p>
            ) : (
              <div className="space-y-2">
                {staffComments.map((comment: any, index: number) => (
                  <div key={index} className="flex justify-between rounded-md border p-3 text-sm">
                    <span>{comment.comment || "-"}</span>
                    <span className="text-muted-foreground">{comment.createdAt ? new Date(comment.createdAt).toLocaleString() : ""}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <Textarea value={newStaffComment} onChange={(e) => setNewStaffComment(e.target.value)} placeholder="Enter staff comment" rows={3} />
              <Button type="button" variant="outline" onClick={addStaffComment}>
                <PencilLine className="h-4 w-4 mr-2" /> Add Comment
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 p-4 space-y-4">
            <h3 className="text-2xl font-semibold">Update Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-sm">Order Status</p>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="order_received">Order Received</SelectItem>
                    <SelectItem value="manufacturing">Manufacturing</SelectItem>
                    <SelectItem value="ready_to_ship">Ready To Ship</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-sm">Payment Status</p>
                <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="due">Due</SelectItem>
                    <SelectItem value="partially_paid">Partially Paid</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-lg font-medium">Payments</p>
                <Button
                  type="button"
                  onClick={() => createPayment.mutate({ data: { orderId: order.id, amount: Number(paymentAmount || 0), mode: paymentMode, notes: paymentNote || null } as any })}
                  disabled={!paymentAmount || createPayment.isPending}
                >
                  Add
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input type="number" min="0" step="0.01" placeholder="Amount" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Payment note (optional)" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} />
              </div>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Payments added yet.</p>
              ) : (
                <div className="space-y-2">
                  {payments.map((payment) => (
                    <div key={payment.id} className="rounded-md border p-3 text-sm flex justify-between">
                      <span>{payment.mode} - ₹{payment.amount.toLocaleString()}</span>
                      <span className="text-muted-foreground">{new Date(payment.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-2xl font-semibold">Remaining Amount: ₹{balance.toLocaleString()}</p>
            </div>

            <Button type="button" className="w-fit" onClick={applyStatusUpdate} disabled={updateOrder.isPending}>
              Update Status
            </Button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Link href={`/orders/${order.id}/edit`}>
              <Button>Edit Order</Button>
            </Link>
          </div>
        </div>
      </div>
      <Dialog open={!!previewImage} onOpenChange={(open) => { if (!open) setPreviewImage(null); }}>
        <DialogContent className="max-w-4xl p-2 bg-transparent border-none shadow-none">
          {previewImage ? (
            <img
              src={previewImage}
              alt="Full preview"
              className="max-h-[85vh] w-full rounded-md object-contain bg-black/70"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

