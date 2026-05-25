import { useState } from "react";
import { Link, Redirect, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDriver,
  createDriverPayment,
  type DriverOrderRow,
} from "@/lib/driver-api";
import { usePermissions } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Truck, IndianRupee } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInr } from "@/lib/format-currency";
import { formatDisplayDate } from "@/lib/format-datetime";

function deliveryStatusBadge(status: string) {
  switch (status) {
    case "out_for_delivery":
      return <Badge variant="outline" className="bg-sky-50 text-sky-800 border-sky-200">Out for delivery</Badge>;
    case "delivered":
      return <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200">Delivered</Badge>;
    default:
      return <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">Pending</Badge>;
  }
}

function formatDeliveryDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const raw = String(iso).trim();
    const d = raw.includes("T") ? new Date(raw) : new Date(`${raw.slice(0, 10)}T00:00:00`);
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return iso;
  }
}

export default function DriverDetailPage() {
  const [, params] = useRoute("/drivers/:id");
  const id = parseInt(params?.id ?? "", 10);
  const { can } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("cash");
  const [payOrderId, setPayOrderId] = useState<string>("none");
  const [payReference, setPayReference] = useState("");
  const [payNotes, setPayNotes] = useState("");

  const { data: driver, isLoading, isError } = useQuery({
    queryKey: ["driver", id],
    queryFn: () => getDriver(id),
    enabled: Number.isFinite(id) && id > 0,
  });

  const payMut = useMutation({
    mutationFn: () =>
      createDriverPayment({
        driverId: id,
        amount: parseFloat(payAmount),
        mode: payMode,
        orderId: payOrderId !== "none" ? parseInt(payOrderId, 10) : null,
        reference: payReference.trim() || null,
        notes: payNotes.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver", id] });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setPayAmount("");
      setPayReference("");
      setPayNotes("");
      setPayOrderId("none");
      toast({ title: "Payment recorded" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (!Number.isFinite(id) || id <= 0) return <Redirect to="/drivers" />;
  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Loading driver…
      </div>
    );
  }
  if (isError || !driver) {
    return <p className="text-muted-foreground">Driver not found.</p>;
  }

  const orders = driver.orders ?? [];

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-muted/40 -mx-4 -mt-4 px-4 py-6 md:-mx-8 md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <Link href="/drivers">
              <Button type="button" variant="ghost" size="icon" className="mt-0.5 shrink-0 rounded-full">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Truck className="h-5 w-5 text-muted-foreground" />
                <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{driver.name}</h1>
                {!driver.isActive ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    Inactive
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {driver.mobile || "No mobile"}
                {driver.vehicleInfo ? ` · ${driver.vehicleInfo}` : ""}
              </p>
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="text-muted-foreground">Total paid to driver</p>
            <p className="text-xl font-semibold tabular-nums">{formatInr(driver.paidTotal)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm md:p-6 space-y-4">
              <div>
                <h2 className="text-base font-semibold tracking-tight">Deliveries</h2>
                <p className="text-xs text-muted-foreground">
                  {orders.length} order{orders.length === 1 ? "" : "s"} assigned to this driver
                </p>
              </div>
              {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deliveries assigned yet.</p>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Delivery date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Charge (₹)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((o: DriverOrderRow) => (
                        <TableRow key={o.id}>
                          <TableCell>
                            <Link
                              href={`/orders/${o.id}`}
                              className="font-mono text-sm text-primary hover:underline"
                            >
                              {o.orderNumber}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm">{o.customerName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDeliveryDate(o.deliveryDate)}
                          </TableCell>
                          <TableCell>{deliveryStatusBadge(o.deliveryStatus)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {o.deliveryCharge > 0 ? formatInr(o.deliveryCharge) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          </div>

          <div className="space-y-6 lg:col-span-4">
            {can("deliveries", "add") && (
              <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
                <div>
                  <h2 className="text-base font-semibold tracking-tight flex items-center gap-2">
                    Record payment
                  </h2>
                  <p className="text-xs text-muted-foreground">Pay driver for a delivery or general.</p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Amount (₹) *</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Mode</Label>
                    <Select value={payMode} onValueChange={setPayMode}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="upi">UPI</SelectItem>
                        <SelectItem value="bank">Bank transfer</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Linked delivery (optional)</Label>
                    <Select value={payOrderId} onValueChange={setPayOrderId}>
                      <SelectTrigger>
                        <SelectValue placeholder="General payment" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">General / not linked</SelectItem>
                        {orders.map((o) => (
                          <SelectItem key={o.id} value={String(o.id)}>
                            {o.orderNumber} — {o.customerName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Reference</Label>
                    <Input value={payReference} onChange={(e) => setPayReference(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea rows={2} value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
                  </div>
                  <Button
                    className="w-full rounded-xl"
                    disabled={!payAmount || parseFloat(payAmount) <= 0 || payMut.isPending}
                    onClick={() => payMut.mutate()}
                  >
                    {payMut.isPending ? "Saving…" : "Record payment"}
                  </Button>
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-3">
              <h2 className="text-base font-semibold tracking-tight">Payment history</h2>
              {driver.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded.</p>
              ) : (
                <ul className="space-y-2 max-h-[360px] overflow-y-auto">
                  {driver.payments.map((p) => (
                    <li
                      key={p.id}
                      className={cn(
                        "rounded-lg border bg-muted/15 px-3 py-2.5 text-sm",
                      )}
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-medium tabular-nums">{formatInr(p.amount)}</span>
                        <span className="text-xs text-muted-foreground capitalize">{p.mode}</span>
                      </div>
                      {p.order ? (
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                          {p.order.orderNumber}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDisplayDate(p.paidAt, { includeTime: true })}
                        {p.recordedBy ? ` · ${p.recordedBy}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {driver.notes ? (
              <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                <h2 className="text-base font-semibold tracking-tight mb-2">Notes</h2>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{driver.notes}</p>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
