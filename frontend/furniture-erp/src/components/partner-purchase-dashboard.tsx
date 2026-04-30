import { useState } from "react";
import {
  type User,
  type UpdatePurchaseOrderStatusBodyStatus,
  useListPurchaseOrders,
  useUpdatePurchaseOrderStatus,
  getListPurchaseOrdersQueryKey,
} from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { partnerPortalLabel } from "@/lib/partner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Factory, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";

const PARTNER_ALLOWED = ["confirmed", "in_production", "shipped", "delivered"] as const;

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
          Pending
        </Badge>
      );
    case "confirmed":
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
          Confirmed
        </Badge>
      );
    case "in_production":
      return (
        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
          In Production
        </Badge>
      );
    case "shipped":
      return (
        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
          Shipped
        </Badge>
      );
    case "delivered":
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          Delivered
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
          Cancelled
        </Badge>
      );
    default:
      return <Badge>{status}</Badge>;
  }
}

export default function PartnerPurchaseDashboard() {
  const { user } = useAuth();
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: poData, isLoading } = useListPurchaseOrders({
    status: status !== "all" ? (status as any) : undefined,
    page,
    limit: 20,
  });

  const updateStatus = useUpdatePurchaseOrderStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        toast({ title: "Status updated" });
      },
      onError: (e: any) =>
        toast({
          title: "Could not update",
          description: e?.data?.error ?? e?.message ?? "Try again.",
          variant: "destructive",
        }),
    },
  });

  const canEditRow = (s: string) =>
    !["cancelled", "delivered"].includes(s);

  const orgLabel = user ? partnerPortalLabel(user as User) : "";
  const isSupplierPortal = !!user?.supplierId;
  const Icon = isSupplierPortal ? Truck : Factory;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Your purchase orders</h2>
        <p className="text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
          <Icon className="h-4 w-4 shrink-0" />
          Signed in as <span className="font-medium text-foreground">{orgLabel}</span>
          <span className="hidden sm:inline">— update status as you confirm, produce, ship, or deliver.</span>
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Assigned POs</CardTitle>
          <CardDescription>
            HQ-created orders for your organization. Allowed updates: Confirmed → In production → Shipped →
            Delivered.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="in_production">In production</SelectItem>
              <SelectItem value="shipped">Shipped</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
            </SelectContent>
          </Select>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Amount (₹)</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : poData?.data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No purchase orders yet.
                  </TableCell>
                </TableRow>
              ) : (
                poData?.data?.map((po: any) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-mono text-sm font-medium">{po.poNumber}</TableCell>
                    <TableCell className="text-muted-foreground">{po.branch?.name ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium">
                      ₹{Number(po.totalAmount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      {canEditRow(po.status) ? (
                        <Select
                          value={po.status}
                          onValueChange={(val: string) =>
                            updateStatus.mutate({
                              id: po.id,
                              data: { status: val as UpdatePurchaseOrderStatusBodyStatus },
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-[164px] border-none bg-transparent shadow-none p-0 focus:ring-0 [&>svg]:shrink-0">
                            <SelectValue asChild>
                              <span className="inline-flex">{getStatusBadge(po.status)}</span>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {[po.status, ...PARTNER_ALLOWED]
                              .filter((v, i, a) => a.indexOf(v) === i)
                              .filter((v) => v === po.status || PARTNER_ALLOWED.includes(v as any))
                              .map((s) => (
                                <SelectItem key={s} value={s} className="capitalize">
                                  {s.replace(/_/g, " ")}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        getStatusBadge(po.status)
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {poData && poData.total > poData.limit && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-sm text-muted-foreground">
              <span>
                Page {page} — showing up to {poData.limit} of {poData.total}
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
                  disabled={page * poData.limit >= poData.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
