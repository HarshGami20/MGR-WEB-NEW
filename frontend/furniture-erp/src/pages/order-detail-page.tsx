import { Link, Redirect, useRoute } from "wouter";
import { useGetOrder } from "@/api-client";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending</Badge>;
    case "confirmed":
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Confirmed</Badge>;
    case "processing":
      return <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">Processing</Badge>;
    case "completed":
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Completed</Badge>;
    case "cancelled":
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Cancelled</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

export default function OrderDetailPage() {
  const [, params] = useRoute("/orders/:id");
  const orderId = params?.id ? parseInt(params.id, 10) : NaN;

  const { data: order, isLoading, isError } = useGetOrder(orderId, {
    query: { enabled: Number.isFinite(orderId) && orderId > 0 },
  });

  if (!Number.isFinite(orderId) || orderId <= 0) return <Redirect to="/orders" />;
  if (isLoading) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading order…</div>;
  if (isError || !order) return <div className="text-muted-foreground">Order not found.</div>;

  const balance = order.totalAmount - order.paidAmount;

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

          <div className="flex justify-end gap-2 pt-2">
            <Link href={`/orders/${order.id}/edit`}>
              <Button>Edit Order</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

