import { useMemo } from "react";
import { Link } from "wouter";
import {
  useListPurchaseOrders,
  type UpdatePurchaseOrderStatusBodyStatus,
} from "@/api-client";
import { useAuth } from "@/lib/auth";
import { isPartnerPortalUser, partnerPortalLabel } from "@/lib/partner";
import { isOpenPurchaseOrderStatus, poStatusLabel } from "@/lib/partner-po-attributes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Factory, Package, Truck, ArrowRight, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

function statusBadgeClass(status: string): string {
  switch (status) {
    case "pending":
      return "bg-yellow-50 text-yellow-800 border-yellow-200";
    case "confirmed":
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "in_production":
      return "bg-purple-50 text-purple-800 border-purple-200";
    case "shipped":
      return "bg-indigo-50 text-indigo-800 border-indigo-200";
    case "delivered":
      return "bg-green-50 text-green-800 border-green-200";
    case "cancelled":
      return "bg-red-50 text-red-800 border-red-200";
    default:
      return "";
  }
}

export default function PartnerDashboardPage() {
  const { user } = useAuth();

  const { data: openData, isLoading: openLoading } = useListPurchaseOrders({
    openOnly: "true",
    page: 1,
    limit: 1,
  });

  const { data: recentData, isLoading: recentLoading } = useListPurchaseOrders({
    page: 1,
    limit: 8,
  });

  const recent = recentData?.data ?? [];
  const openTotal = openData?.total ?? 0;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const po of recent) {
      const s = String(po.status ?? "pending");
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [recent]);

  if (!user || !isPartnerPortalUser(user)) return null;

  const isSupplier = !!user.supplierId;
  const Icon = isSupplier ? Truck : Factory;
  const panelTitle = isSupplier ? "Supplier portal" : "Manufacturer portal";
  const orgLabel = partnerPortalLabel(user);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{panelTitle}</h1>
          <p className="text-muted-foreground flex flex-wrap items-center gap-2 mt-2">
            <Icon className="h-4 w-4 shrink-0" />
            <span>
              Welcome, <span className="font-medium text-foreground">{orgLabel}</span>
            </span>
          </p>
          <p className="text-sm text-muted-foreground mt-2 max-w-xl">
            Track purchase orders from MGR CASA, update delivery status, and open product specifications on any line
            item.
          </p>
        </div>
        <Button asChild className="rounded-xl shrink-0">
          <Link href="/purchase-orders">
            <ClipboardList className="h-4 w-4 mr-2" />
            All orders
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open orders</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{openLoading ? "…" : openTotal}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Awaiting confirmation, production, or shipment</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{statusCounts.pending ?? 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">In recent activity (last 8 orders)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>In progress</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {(statusCounts.confirmed ?? 0) + (statusCounts.in_production ?? 0) + (statusCounts.shipped ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Confirmed, production, or shipped</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Your account</CardDescription>
            <CardTitle className="text-lg">{isSupplier ? "Supplier" : "Manufacturer"}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Portal access for PO fulfilment only</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5 text-muted-foreground" />
              Recent purchase orders
            </CardTitle>
            <CardDescription>Click a row to open order details and line items</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild className="rounded-lg">
            <Link href="/purchase-orders">
              View all
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {recentLoading ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Loading orders…</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">No purchase orders yet.</p>
          ) : (
            <div className="rounded-xl border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>PO number</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expected delivery</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((po) => {
                    const open = isOpenPurchaseOrderStatus(String(po.status));
                    const delivery = po.expectedDelivery
                      ? new Date(po.expectedDelivery).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—";
                    return (
                      <TableRow key={po.id} className="group">
                        <TableCell>
                          <Link
                            href={`/purchase-orders/${po.id}`}
                            className="font-mono font-medium text-primary hover:underline"
                          >
                            {po.poNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {(po as { branch?: { name?: string } }).branch?.name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("font-normal", statusBadgeClass(String(po.status)))}
                          >
                            {poStatusLabel(String(po.status))}
                          </Badge>
                          {open ? (
                            <span className="sr-only">Open order</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{delivery}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          ₹{Number(po.totalAmount ?? 0).toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell>
                          <Link href={`/purchase-orders/${po.id}`}>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 opacity-70 group-hover:opacity-100">
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
