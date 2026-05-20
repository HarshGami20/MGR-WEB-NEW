import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListPurchaseOrders,
  useUpdatePurchaseOrderStatus,
  getListPurchaseOrdersQueryKey,
  type UpdatePurchaseOrderStatusBodyStatus,
} from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { isPartnerPortalUser, partnerPortalLabel } from "@/lib/partner";
import { isOpenPurchaseOrderStatus, poStatusLabel } from "@/lib/partner-po-attributes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, ArrowRight, ClipboardList, Factory, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

const PARTNER_STATUS_OPTIONS = ["confirmed", "in_production", "shipped", "delivered"] as const;

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

export default function PartnerPurchaseOrdersListPage() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const listParams = useMemo(() => {
    if (statusFilter === "open") return { openOnly: "true" as const, page, limit: 20 };
    if (statusFilter === "all") return { page, limit: 20 };
    return { status: statusFilter as UpdatePurchaseOrderStatusBodyStatus, page, limit: 20 };
  }, [statusFilter, page]);

  const { data, isLoading } = useListPurchaseOrders(listParams as Parameters<typeof useListPurchaseOrders>[0]);

  const updateStatus = useUpdatePurchaseOrderStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        toast({ title: "Status updated" });
      },
      onError: (e: { data?: { error?: string }; message?: string }) =>
        toast({
          title: "Could not update",
          description: e?.data?.error ?? e?.message ?? "Try again.",
          variant: "destructive",
        }),
    },
  });

  if (!user || !isPartnerPortalUser(user)) return null;

  const rows = data?.data ?? [];
  const isSupplier = !!user.supplierId;
  const PanelIcon = isSupplier ? Truck : Factory;

  return (
    <div className="space-y-6 max-w-6xl animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/dashboard">
            <Button type="button" variant="ghost" size="sm" className="mb-2 -ml-2 gap-1.5 text-muted-foreground">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Button>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-7 w-7 text-muted-foreground" />
            Purchase orders
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
            <PanelIcon className="h-4 w-4" />
            {partnerPortalLabel(user)}
          </p>
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[220px] rounded-xl">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open orders</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="in_production">In production</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Order list</CardTitle>
          <CardDescription>
            Select a purchase order to view products, specs, and update delivery status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-12 text-center">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">No orders match this filter.</p>
          ) : (
            <div className="rounded-xl border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>PO number</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right w-[200px]">Quick status</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((po) => {
                    const canQuickEdit = !["cancelled", "delivered"].includes(String(po.status));
                    const itemCount = (po as { items?: unknown[] }).items?.length;
                    return (
                      <TableRow key={po.id}>
                        <TableCell>
                          <Link
                            href={`/purchase-orders/${po.id}`}
                            className="font-mono font-semibold text-primary hover:underline"
                          >
                            {po.poNumber}
                          </Link>
                          {itemCount != null ? (
                            <p className="text-xs text-muted-foreground mt-0.5">{itemCount} line(s)</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {(po as { branch?: { name?: string } }).branch?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {new Date(po.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {po.expectedDelivery
                            ? new Date(po.expectedDelivery).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("font-normal", statusBadgeClass(String(po.status)))}>
                            {poStatusLabel(String(po.status))}
                          </Badge>
                          {isOpenPurchaseOrderStatus(String(po.status)) ? (
                            <span className="ml-1.5 text-[10px] text-amber-700 font-medium">Open</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          ₹{Number(po.totalAmount ?? 0).toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-right">
                          {canQuickEdit ? (
                            <Select
                              value={String(po.status)}
                              onValueChange={(val) =>
                                updateStatus.mutate({
                                  id: po.id,
                                  data: { status: val as UpdatePurchaseOrderStatusBodyStatus },
                                })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs ml-auto max-w-[180px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[String(po.status), ...PARTNER_STATUS_OPTIONS]
                                  .filter((v, i, a) => a.indexOf(v) === i)
                                  .map((s) => (
                                    <SelectItem key={s} value={s}>
                                      {poStatusLabel(s)}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground">{poStatusLabel(String(po.status))}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Link href={`/purchase-orders/${po.id}`}>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Open order">
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

          {data && data.total > data.limit ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t mt-4 pt-4 text-sm text-muted-foreground">
              <span>
                Page {page} — {data.total} total
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page * data.limit >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
