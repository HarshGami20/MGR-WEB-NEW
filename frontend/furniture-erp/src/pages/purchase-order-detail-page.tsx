import { useEffect, useState, type ReactNode } from "react";
import { Link, Redirect, useLocation, useRoute } from "wouter";
import {
  getGetPurchaseOrderQueryKey,
  getListPurchaseOrdersQueryKey,
  useDeletePurchaseOrder,
  useGetPurchaseOrder,
  useUpdatePurchaseOrder,
  useUpdatePurchaseOrderStatus,
  type UpdatePurchaseOrderStatusBodyStatus,
} from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { partnerLineSpecFromAttributes, poStatusLabel } from "@/lib/partner-po-attributes";
import { parseImageUrlsList, productImageList, variantImageList } from "@/lib/image-urls";
import { resolvedProductImageUrl } from "@/lib/product-image-url";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Factory,
  FileText,
  IndianRupee,
  MapPin,
  Package,
  PencilLine,
  Phone,
  Plus,
  Trash2,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ALL_STATUSES: UpdatePurchaseOrderStatusBodyStatus[] = [
  "pending",
  "confirmed",
  "in_production",
  "shipped",
  "delivered",
  "cancelled",
];

type PoLineItem = {
  id: number;
  isCustom?: boolean;
  customName?: string | null;
  customImageUrl?: string | null;
  customImageUrls?: string[] | string | null;
  customAttributes?: string | null;
  description?: string | null;
  productId?: number | null;
  quantity: number;
  unitPrice: number;
  product?: {
    id: number;
    name: string;
    sku?: string;
    imageUrl?: string | null;
    imageUrls?: string | string[] | null;
  } | null;
  variant?: {
    id: number;
    name: string;
    sku?: string;
    imageUrl?: string | null;
    imageUrls?: string | string[] | null;
    attributes?: string | null;
  } | null;
};

function formatCommentDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function DetailSection({
  title,
  description,
  children,
  className,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border/60 bg-card p-5 shadow-sm md:p-6 space-y-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {description ? <p className="text-xs text-muted-foreground mt-0.5">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function InfoRow({
  label,
  value,
  icon,
  mono,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  mono?: boolean;
}) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div className="flex gap-3 py-2.5 border-b border-border/50 last:border-0 last:pb-0">
      {icon ? <span className="text-muted-foreground shrink-0 mt-0.5">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("text-sm text-foreground mt-0.5 break-words", mono && "font-mono")}>{value}</p>
      </div>
    </div>
  );
}

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
      return <Badge>{poStatusLabel(status)}</Badge>;
  }
}

function lineImageUrls(item: PoLineItem): string[] {
  if (item.isCustom) {
    return parseImageUrlsList(item.customImageUrls, item.customImageUrl)
      .map((u) => resolvedProductImageUrl(u))
      .filter((u): u is string => Boolean(u));
  }
  const variantPhotos = item.variant
    ? variantImageList(item.variant as { imageUrls?: string | string[] | null; imageUrl?: string | null })
    : [];
  const productPhotos = item.product ? productImageList(item.product) : [];
  return [...variantPhotos, ...productPhotos]
    .map((u) => resolvedProductImageUrl(u))
    .filter((u): u is string => Boolean(u));
}

function SpecCell({ value }: { value?: string }) {
  return (
    <span className={cn("text-sm", value ? "text-foreground" : "text-muted-foreground")}>
      {value || "—"}
    </span>
  );
}

export default function PurchaseOrderDetailPage() {
  const [, params] = useRoute("/purchase-orders/:id");
  const poId = params?.id ? parseInt(params.id, 10) : NaN;
  const [, setLocation] = useLocation();
  const { can } = usePermissions();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [expectedDeliveryDraft, setExpectedDeliveryDraft] = useState("");
  const [newStaffComment, setNewStaffComment] = useState("");
  const [showStaffCommentForm, setShowStaffCommentForm] = useState(false);

  const { data: po, isLoading, isError } = useGetPurchaseOrder(poId, {
    query: { enabled: Number.isFinite(poId) && poId > 0 },
  });

  const updateStatus = useUpdatePurchaseOrderStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPurchaseOrderQueryKey(poId) });
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        toast({ title: "PO status updated" });
      },
      onError: (e: { data?: { error?: string }; message?: string }) =>
        toast({
          title: "Update failed",
          description: e?.data?.error ?? e?.message,
          variant: "destructive",
        }),
    },
  });

  const updatePo = useUpdatePurchaseOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPurchaseOrderQueryKey(poId) });
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        toast({ title: "Purchase order updated" });
      },
      onError: (e: { data?: { error?: string }; message?: string }) =>
        toast({
          title: "Update failed",
          description: e?.data?.error ?? e?.message,
          variant: "destructive",
        }),
    },
  });

  const deletePO = useDeletePurchaseOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        toast({ title: "Purchase order deleted" });
        setLocation("/purchase-orders");
      },
      onError: (e: { data?: { error?: string }; message?: string }) =>
        toast({
          title: "Delete failed",
          description: e?.data?.error ?? e?.message,
          variant: "destructive",
        }),
    },
  });

  useEffect(() => {
    if (!po) return;
    setNotesDraft(po.notes ?? "");
    setExpectedDeliveryDraft(
      po.expectedDelivery ? new Date(po.expectedDelivery).toISOString().slice(0, 10) : "",
    );
  }, [po]);

  if (!Number.isFinite(poId) || poId <= 0) return <Redirect to="/purchase-orders" />;
  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Loading purchase order…
      </div>
    );
  }
  if (isError || !po) {
    return <div className="text-muted-foreground">Purchase order not found.</div>;
  }

  const staffComments = Array.isArray((po as { staffComments?: unknown }).staffComments)
    ? ((po as { staffComments: Array<{ comment?: string; authorName?: string; createdAt?: string }> }).staffComments)
    : [];

  const addStaffComment = () => {
    const text = newStaffComment.trim();
    if (!text) return;
    const next = [
      ...staffComments,
      {
        comment: text,
        authorName: user?.name ?? undefined,
        createdAt: new Date().toISOString(),
      },
    ];
    updatePo.mutate({
      id: po.id,
      data: { staffComments: next } as any,
    });
    setNewStaffComment("");
    setShowStaffCommentForm(false);
  };

  const poAny = po as {
    type: string;
    staffComments?: Array<{ comment?: string; authorName?: string; createdAt?: string }>;
    supplier?: {
      name: string;
      contactPerson?: string | null;
      mobile?: string | null;
      email?: string | null;
      address?: string | null;
      gstNumber?: string | null;
    } | null;
    manufacturer?: {
      name: string;
      contactPerson?: string | null;
      mobile?: string | null;
      email?: string | null;
      address?: string | null;
      specialization?: string | null;
    } | null;
    branch?: { name: string; code?: string; city?: string | null; state?: string | null } | null;
    items?: PoLineItem[];
  };

  const vendor = poAny.type === "supplier" ? poAny.supplier : poAny.manufacturer;
  const vendorLabel = poAny.type === "supplier" ? "Supplier" : "Manufacturer";
  const VendorIcon = poAny.type === "supplier" ? Truck : Factory;
  const items = poAny.items ?? [];

  const expectedDeliveryLabel = po.expectedDelivery
    ? new Date(po.expectedDelivery).toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Not scheduled";

  const saveDetails = () => {
    updatePo.mutate({
      id: po.id,
      data: {
        notes: notesDraft.trim() || null,
        expectedDelivery: expectedDeliveryDraft || null,
      },
    });
  };

  const detailsDirty =
    (notesDraft.trim() || "") !== (po.notes?.trim() || "") ||
    (expectedDeliveryDraft || "") !==
      (po.expectedDelivery ? new Date(po.expectedDelivery).toISOString().slice(0, 10) : "");

  const handleDelete = () => {
    if (
      confirm(
        `Delete purchase order ${po.poNumber}?${
          po.status === "delivered" ? " Stock added on delivery will be reversed." : ""
        }`,
      )
    ) {
      deletePO.mutate({ id: po.id });
    }
  };

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-muted/40 -mx-4 -mt-4 px-4 py-6 md:-mx-8 md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Page header — matches order editor */}
        <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <Link href="/purchase-orders">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-0.5 shrink-0 rounded-full"
                aria-label="Back to purchase orders"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight font-mono md:text-2xl">{po.poNumber}</h1>
                <Badge variant="secondary" className="capitalize font-normal">
                  {poAny.type}
                </Badge>
                {getStatusBadge(po.status)}
              </div>
              <p className="text-sm text-muted-foreground">
                Created {new Date(po.createdAt).toLocaleString()}
                {poAny.branch?.name ? (
                  <>
                    {" "}
                    · <Building2 className="inline h-3.5 w-3.5 -mt-0.5" /> {poAny.branch.name}
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {can("purchaseOrders", "delete") ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={deletePO.isPending}
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Main column — line items */}
          <div className="space-y-6 lg:col-span-8">
            <DetailSection
              title="Line items"
              description={`${items.length} product${items.length === 1 ? "" : "s"} on this purchase order`}
            >
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-xl">
                  No line items on this purchase order.
                </p>
              ) : (
                <>
                  <div className="rounded-xl border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead className="min-w-[220px]">Product</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead>Colour</TableHead>
                          <TableHead>Fabric</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Unit</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item) => {
                          const isCustom = !!item.isCustom;
                          const spec = isCustom
                            ? partnerLineSpecFromAttributes(item.customAttributes)
                            : partnerLineSpecFromAttributes(
                                item.variant?.attributes,
                                item.variant?.name,
                              );
                          const photos = lineImageUrls(item);
                          const lineName = isCustom
                            ? item.customName ?? "Custom item"
                            : item.product?.name ?? `Product #${item.productId}`;
                          const lineDesc = item.description?.trim();
                          const lineTotal = Number(item.unitPrice) * item.quantity;
                          return (
                            <TableRow key={item.id}>
                              <TableCell>
                                <div className="flex items-start gap-3">
                                  {photos.length > 0 ? (
                                    <div className="flex flex-wrap gap-1 shrink-0 max-w-[88px]">
                                      {photos.slice(0, 3).map((url, imgIndex) => (
                                        <img
                                          key={`${url}-${imgIndex}`}
                                          src={url}
                                          alt={lineName}
                                          className="h-11 w-11 rounded-lg object-cover border bg-muted cursor-zoom-in hover:opacity-90 transition-opacity"
                                          onClick={() => setPreviewImage(url)}
                                        />
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="h-11 w-11 rounded-lg border bg-muted shrink-0 flex items-center justify-center">
                                      <Package className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="font-medium text-sm leading-snug">
                                      {lineName}
                                      {isCustom ? (
                                        <Badge
                                          variant="outline"
                                          className="ml-2 text-[10px] px-1.5 py-0 align-middle"
                                        >
                                          Custom
                                        </Badge>
                                      ) : null}
                                    </p>
                                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                      {isCustom
                                        ? "Custom line"
                                        : `${item.variant?.sku ?? item.product?.sku ?? "—"}${
                                            spec.variantName ? ` · ${spec.variantName}` : ""
                                          }`}
                                    </p>
                                    {lineDesc ? (
                                      <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                                        {lineDesc}
                                      </p>
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
                                ₹{Number(item.unitPrice).toLocaleString("en-IN")}
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                ₹{lineTotal.toLocaleString("en-IN")}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex justify-end pt-2">
                    <div className="rounded-xl border bg-muted/20 px-4 py-3 min-w-[200px]">
                      <div className="flex justify-between gap-8 text-sm">
                        <span className="text-muted-foreground">PO total</span>
                        <span className="font-semibold tabular-nums">
                          ₹{Number(po.totalAmount).toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </DetailSection>

            {!can("purchaseOrders", "edit") && po.notes?.trim() ? (
              <DetailSection title="Notes" description="Internal notes for this PO">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{po.notes}</p>
              </DetailSection>
            ) : null}

            <DetailSection
              title="Staff comments"
              description="Internal notes visible to staff"
              action={
                can("purchaseOrders", "edit") && !showStaffCommentForm ? (
                  <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => setShowStaffCommentForm(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                ) : undefined
              }
            >
              {staffComments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-xl">
                  No staff comments yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {staffComments.map((comment, index) => (
                    <div key={index} className="rounded-md border bg-muted/20 p-3 text-sm space-y-1">
                      <p className="whitespace-pre-wrap">{comment.comment || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {comment.authorName ? `${comment.authorName} · ` : ""}
                        {comment.createdAt ? formatCommentDateTime(comment.createdAt) : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {can("purchaseOrders", "edit") && showStaffCommentForm ? (
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <Textarea
                    value={newStaffComment}
                    onChange={(e) => setNewStaffComment(e.target.value)}
                    placeholder="Enter staff comment…"
                    rows={3}
                    className="rounded-xl resize-none"
                    autoFocus
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="rounded-xl"
                      onClick={addStaffComment}
                      disabled={!newStaffComment.trim() || updatePo.isPending}
                    >
                      <PencilLine className="h-4 w-4 mr-2" />
                      Save comment
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setNewStaffComment("");
                        setShowStaffCommentForm(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </DetailSection>
          </div>

          {/* Sidebar — summary, status, vendor, schedule */}
          <aside className="space-y-6 lg:col-span-4 lg:sticky lg:top-4 lg:self-start">
            <DetailSection title="Summary" description="Amount and delivery">
              <div className="rounded-xl border bg-muted/15 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <IndianRupee className="h-4 w-4" />
                    Total amount
                  </span>
                  <span className="text-xl font-bold tabular-nums">
                    ₹{Number(po.totalAmount).toLocaleString("en-IN")}
                  </span>
                </div>
                <Separator />
                <div className="flex items-start justify-between gap-2 text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <CalendarClock className="h-4 w-4 shrink-0" />
                    Expected delivery
                  </span>
                  <span className="font-medium text-right">{expectedDeliveryLabel}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Line items</span>
                  <span className="font-medium">{items.length}</span>
                </div>
              </div>
              {po.status === "delivered" ? (
                <p className="text-xs text-muted-foreground rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-green-800">
                  Stock was added to inventory when this PO was marked delivered.
                </p>
              ) : null}
            </DetailSection>

            {can("purchaseOrders", "edit") ? (
              <DetailSection title="Status" description="Update procurement progress">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Current</span>
                    {getStatusBadge(po.status)}
                  </div>
                  <Select
                    value={po.status}
                    onValueChange={(val) =>
                      updateStatus.mutate({
                        id: po.id,
                        data: { status: val as UpdatePurchaseOrderStatusBodyStatus },
                      })
                    }
                    disabled={updateStatus.isPending}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Change status" />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {poStatusLabel(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </DetailSection>
            ) : null}

            <DetailSection
              title={vendorLabel}
              description={poAny.type === "supplier" ? "Ready goods vendor" : "Custom manufacturing partner"}
            >
              {vendor ? (
                <div className="rounded-xl border bg-muted/10 px-3 py-1">
                  <InfoRow label="Company" value={vendor.name} icon={<VendorIcon className="h-4 w-4" />} />
                  <InfoRow label="Contact" value={vendor.contactPerson} />
                  <InfoRow label="Mobile" value={vendor.mobile} icon={<Phone className="h-4 w-4" />} />
                  <InfoRow label="Email" value={vendor.email} />
                  <InfoRow label="Address" value={vendor.address} icon={<MapPin className="h-4 w-4" />} />
                  {"gstNumber" in vendor && vendor.gstNumber ? (
                    <InfoRow label="GST" value={vendor.gstNumber} mono />
                  ) : null}
                  {"specialization" in vendor && vendor.specialization ? (
                    <InfoRow label="Specialization" value={vendor.specialization} />
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No vendor linked</p>
              )}
            </DetailSection>

            {can("purchaseOrders", "edit") ? (
              <DetailSection title="Schedule & notes" description="Expected delivery and internal notes">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Expected delivery</label>
                    <Input
                      type="date"
                      className="rounded-xl"
                      value={expectedDeliveryDraft}
                      onChange={(e) => setExpectedDeliveryDraft(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Notes
                    </label>
                    <Textarea
                      className="rounded-xl resize-none"
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="Internal notes for this purchase order…"
                      rows={4}
                    />
                  </div>
                  <Button
                    type="button"
                    className="w-full rounded-xl"
                    variant="secondary"
                    disabled={!detailsDirty || updatePo.isPending}
                    onClick={saveDetails}
                  >
                    Save details
                  </Button>
                </div>
              </DetailSection>
            ) : null}
          </aside>
        </div>
      </div>

      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-4xl p-2 bg-transparent border-none shadow-none">
          {previewImage ? (
            <img
              src={previewImage}
              alt="Preview"
              className="max-h-[85vh] w-full rounded-md object-contain bg-black/70"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
