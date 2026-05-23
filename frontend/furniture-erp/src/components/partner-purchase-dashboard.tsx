import { useMemo, useState } from "react";
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
import { isPartnerPortalUser, partnerPortalLabel } from "@/lib/partner";
import {
  isOpenPurchaseOrderStatus,
  partnerLineSpecFromAttributes,
  poStatusLabel,
} from "@/lib/partner-po-attributes";
import { resolvedProductImageUrl } from "@/lib/product-image-url";
import { parseImageUrlsList, variantImageList } from "@/lib/image-urls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Factory, Package, Truck, CalendarClock, MapPin, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatInr } from "@/lib/format-currency";

const PARTNER_ALLOWED = ["confirmed", "in_production", "shipped", "delivered"] as const;

type PartnerPoItem = {
  id: number;
  productId?: number | null;
  isCustom?: boolean;
  customName?: string | null;
  customImageUrl?: string | null;
  customImageUrls?: string[] | null;
  customAttributes?: string | null;
  quantity: number;
  unitPrice: number;
  product?: { id: number; name: string; sku: string; imageUrl?: string | null } | null;
  variant?: {
    id: number;
    name: string;
    sku: string;
    imageUrl?: string | null;
    attributes?: string | null;
    price?: number | null;
  } | null;
};

type PartnerPo = {
  id: number;
  poNumber: string;
  status: string;
  totalAmount: number;
  expectedDelivery?: string | null;
  notes?: string | null;
  createdAt: string;
  branch?: { id: number; name: string } | null;
  items?: PartnerPoItem[];
};

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
          In production
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
      return <Badge>{poStatusLabel(status)}</Badge>;
  }
}

function SpecCell({ value }: { value?: string }) {
  return (
    <span className={cn("text-sm", value ? "text-foreground" : "text-muted-foreground")}>
      {value || "—"}
    </span>
  );
}

function PartnerPoCard({
  po,
  canEdit,
  onStatusChange,
}: {
  po: PartnerPo;
  canEdit: boolean;
  onStatusChange: (status: UpdatePurchaseOrderStatusBodyStatus) => void;
}) {
  const items = po.items ?? [];
  const deliveryLabel = po.expectedDelivery
    ? new Date(po.expectedDelivery).toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Not scheduled";

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="pb-3 bg-muted/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-mono">{po.poNumber}</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {po.branch?.name ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {po.branch.name}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" />
                Expected: {deliveryLabel}
              </span>
              <span className="font-medium text-foreground">
                {formatInr(Number(po.totalAmount))}
              </span>
            </CardDescription>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
            <div className="text-xs text-muted-foreground">Delivery status</div>
            {canEdit ? (
              <Select
                value={po.status}
                onValueChange={(val) => onStatusChange(val as UpdatePurchaseOrderStatusBodyStatus)}
              >
                <SelectTrigger className="h-9 w-[180px]">
                  <SelectValue asChild>
                    <span className="inline-flex">{getStatusBadge(po.status)}</span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[po.status, ...PARTNER_ALLOWED]
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .filter((v) => v === po.status || PARTNER_ALLOWED.includes(v as (typeof PARTNER_ALLOWED)[number]))
                    .map((s) => (
                      <SelectItem key={s} value={s}>
                        {poStatusLabel(s)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : (
              getStatusBadge(po.status)
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {po.notes?.trim() ? (
          <div className="rounded-lg border bg-muted/15 px-3 py-2 text-sm flex gap-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
            <p className="text-muted-foreground">{po.notes}</p>
          </div>
        ) : null}

        <div>
          <p className="text-sm font-medium mb-2 flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            Products ({items.length})
          </p>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
              No line items on this purchase order.
            </p>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Product</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Colour</TableHead>
                    <TableHead>Fabric</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const isCustom = !!item.isCustom;
                    const spec = isCustom
                      ? partnerLineSpecFromAttributes(item.customAttributes)
                      : partnerLineSpecFromAttributes(item.variant?.attributes, item.variant?.name);
                    const customPhotos = isCustom
                      ? parseImageUrlsList(item.customImageUrls, item.customImageUrl)
                      : [];
                    const variantPhotos = item.variant
                      ? variantImageList(item.variant as { imageUrls?: string | string[] | null; imageUrl?: string | null })
                      : [];
                    const img = resolvedProductImageUrl(
                      isCustom
                        ? customPhotos[0]
                        : variantPhotos[0] ?? item.product?.imageUrl ?? null,
                    );
                    const lineName = isCustom
                      ? item.customName ?? "Custom item"
                      : item.product?.name ?? `Product #${item.productId}`;
                    const lineDesc = (item as { description?: string | null }).description?.trim();
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center gap-3 min-w-[180px]">
                            {img ? (
                              <img
                                src={img}
                                alt=""
                                className="h-10 w-10 rounded-md object-cover border bg-muted shrink-0"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-md border bg-muted shrink-0 flex items-center justify-center">
                                <Package className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">
                                {lineName}
                                {isCustom ? (
                                  <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">
                                    Custom
                                  </Badge>
                                ) : null}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono">
                                {isCustom
                                  ? "Order-specific line"
                                  : `${item.variant?.sku ?? item.product?.sku ?? ""}${spec.variantName ? ` · ${spec.variantName}` : ""}`}
                              </p>
                              {lineDesc ? (
                                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{lineDesc}</p>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <SpecCell value={spec.size} />
                        </TableCell>
                        <TableCell>
                          <SpecCell value={spec.colour} />
                        </TableCell>
                        <TableCell>
                          <SpecCell value={spec.fabric} />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatInr(Number(item.unitPrice))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function PartnerPurchaseDashboard() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const listParams = useMemo(() => {
    if (statusFilter === "open") {
      return { openOnly: "true" as const, page, limit: 20 };
    }
    if (statusFilter === "all") {
      return { page, limit: 20 };
    }
    return { status: statusFilter as UpdatePurchaseOrderStatusBodyStatus, page, limit: 20 };
  }, [statusFilter, page]);

  const { data: poData, isLoading } = useListPurchaseOrders(listParams as Parameters<typeof useListPurchaseOrders>[0]);

  const updateStatus = useUpdatePurchaseOrderStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        toast({ title: "Delivery status updated" });
      },
      onError: (e: { data?: { error?: string }; message?: string }) =>
        toast({
          title: "Could not update",
          description: e?.data?.error ?? e?.message ?? "Try again.",
          variant: "destructive",
        }),
    },
  });

  const partnerPos = (poData?.data ?? []) as PartnerPo[];

  const openCount = useMemo(
    () => partnerPos.filter((p) => isOpenPurchaseOrderStatus(p.status)).length,
    [partnerPos],
  );

  const orgLabel = user ? partnerPortalLabel(user as User) : "";
  const isSupplierPortal = !!user?.supplierId;
  const Icon = isSupplierPortal ? Truck : Factory;
  const panelTitle = isSupplierPortal ? "Supplier panel" : "Manufacturer panel";

  if (!user || !isPartnerPortalUser(user)) {
    return null;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{panelTitle}</h2>
        <p className="text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
          <Icon className="h-4 w-4 shrink-0" />
          <span>
            Signed in as <span className="font-medium text-foreground">{orgLabel}</span>
          </span>
        </p>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          View open purchase orders with product specifications, update delivery status as you confirm,
          produce, ship, or complete delivery.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open orders</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{statusFilter === "open" ? poData?.total ?? openCount : openCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>On this page</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{partnerPos.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Your role</CardDescription>
            <CardTitle className="text-lg">{isSupplierPortal ? "Supplier" : "Manufacturer"}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Filter orders" />
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

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-12 text-center">Loading purchase orders…</p>
      ) : partnerPos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            {statusFilter === "open"
              ? "No open purchase orders right now."
              : "No purchase orders match this filter."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {partnerPos.map((po) => (
            <PartnerPoCard
              key={po.id}
              po={po}
              canEdit={!["cancelled", "delivered"].includes(po.status)}
              onStatusChange={(status) =>
                updateStatus.mutate({ id: po.id, data: { status } })
              }
            />
          ))}
        </div>
      )}

      {poData && poData.total > poData.limit ? (
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
      ) : null}
    </div>
  );
}
