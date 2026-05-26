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
  import { isPartnerPortalUser } from "@/lib/partner";
  import { usePermissions } from "@/lib/permissions";
  import { poStatusLabel } from "@/lib/partner-po-attributes";
  import { parseImageUrlsList, productImageList, variantImageList } from "@/lib/image-urls";
  import { resolvedProductImageUrl } from "@/lib/product-image-url";
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
  import { Textarea } from "@/components/ui/textarea";
  import { Input } from "@/components/ui/input";
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
  import { Separator } from "@/components/ui/separator";
  import {
    OrderImageGalleryDialog,
    type GallerySlide,
  } from "@/components/order-image-gallery-dialog";
  import {
    ArrowLeft,
    Building2,
    CalendarClock,
    FileText,
    Package,
    PencilLine,
    Plus,
    Headphones,
    Trash2,
  } from "lucide-react";
  import { cn } from "@/lib/utils";
  import { formatInr } from "@/lib/format-currency";
  import { formatDisplayDate } from "@/lib/format-datetime";

  const ALL_STATUSES: UpdatePurchaseOrderStatusBodyStatus[] = [
    "pending",
    "confirmed",
    "in_production",
    "shipped",
    "delivered",
    "cancelled",
  ];

  function todayDateInputValue(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const PARTNER_STATUS_OPTIONS = ["confirmed", "in_production", "shipped", "delivered"] as const;

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

  export default function PurchaseOrderDetailPage() {
    const [, params] = useRoute("/purchase-orders/:id");
    const poId = params?.id ? parseInt(params.id, 10) : NaN;
    const [, setLocation] = useLocation();
    const { can } = usePermissions();
    const { user } = useAuth();
    const partnerUser = isPartnerPortalUser(user);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [imageGallery, setImageGallery] = useState<{ slides: GallerySlide[]; index: number } | null>(null);
    const [notesDraft, setNotesDraft] = useState("");
    const [expectedDeliveryDraft, setExpectedDeliveryDraft] = useState("");
    const [newStaffComment, setNewStaffComment] = useState("");
    const [showStaffCommentForm, setShowStaffCommentForm] = useState(false);

    const openImageGallery = (slides: GallerySlide[], startIndex = 0) => {
      const valid = slides.filter((s) => Boolean(s.src?.trim()));
      if (!valid.length) return;
      setImageGallery({
        slides: valid,
        index: Math.min(Math.max(0, startIndex), valid.length - 1),
      });
    };

    const openUrlGallery = (urls: string[], startIndex = 0) => {
      openImageGallery(
        urls.filter((u): u is string => Boolean(u)).map((src) => ({ src })),
        startIndex,
      );
    };

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

    if (!Number.isFinite(poId) || poId <= 0) return <Redirect to={partnerUser ? "/purchase-orders" : "/purchase-orders"} />;
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
    const items = poAny.items ?? [];

  const expectedDeliveryLabel = po.expectedDelivery
    ? formatDisplayDate(po.expectedDelivery, { includeWeekday: true })
    : "Not scheduled";

    const minDeliveryDate = todayDateInputValue();
    const expectedDeliveryInPast = Boolean(
      expectedDeliveryDraft && expectedDeliveryDraft < minDeliveryDate,
    );

    const saveDetails = () => {
      if (expectedDeliveryInPast) {
        toast({
          title: "Invalid expected delivery",
          description: "Expected delivery date cannot be in the past.",
          variant: "destructive",
        });
        return;
      }
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
                  aria-label={partnerUser ? "Back to orders" : "Back to purchase orders"}
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
                 {formatDisplayDate(po.createdAt, { includeTime: true })}
                  {poAny.branch?.name ? (
                    <>
                      {" "}
                      · <span className="font-medium text-dark">Branch:</span> {poAny.branch.name}
                    </>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {can("complaints", "add") ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() =>
                    setLocation(`/complaints?kind=purchase_order&purchaseOrderId=${po.id}&create=1`)
                  }
                >
                  <Headphones className="h-4 w-4 mr-2" />
                  Raise complaint
                </Button>
              ) : null}
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
                title="Purchase order details"
                description={`${items.length} product${items.length === 1 ? "" : "s"} on this purchase order`}
              >
                {vendor ? (
                  <div className="rounded-lg border bg-muted/10 px-3 py-2.5 pb-3 mb-3 border-b border-border/50">
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
                      {vendor.name ? (
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">Name</p>
                          <p className="font-medium text-foreground">{vendor.name}</p>
                        </div>
                      ) : null}
                      {vendor.contactPerson ? (
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">Contact person</p>
                          <p className="text-foreground">{vendor.contactPerson}</p>
                        </div>
                      ) : null}
                      {vendor.mobile ? (
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">Mobile</p>
                          <p className="font-mono text-foreground">{vendor.mobile}</p>
                        </div>
                      ) : null}
                      {vendor.address ? (
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">Address</p>
                          <p className="text-foreground leading-snug">{vendor.address}</p>
                        </div>
                      ) : null}
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Type</p>
                        <p className="text-foreground">{vendorLabel}</p>
                      </div>
                      {vendor.email ? (
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">Email</p>
                          <p className="text-foreground truncate">{vendor.email}</p>
                        </div>
                      ) : null}
                      {"gstNumber" in vendor && vendor.gstNumber ? (
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">GST</p>
                          <p className="font-mono text-foreground">{vendor.gstNumber}</p>
                        </div>
                      ) : null}
                      {"specialization" in vendor && vendor.specialization ? (
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">Specialization</p>
                          <p className="text-foreground">{vendor.specialization}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border bg-muted/10 px-3 py-2.5 pb-3 mb-3 border-b border-border/50">
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Name</p>
                        <p className="font-medium text-foreground">—</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Mobile</p>
                        <p className="font-mono text-foreground">—</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Address</p>
                        <p className="text-foreground leading-snug">—</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Type</p>
                        <p className="text-foreground">{vendorLabel}</p>
                      </div>
                    </div>
                  </div>
                )}

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
                            <TableHead className="min-w-[200px]">Product</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Price</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((item) => {
                            const isCustom = !!item.isCustom;
                            const photos = lineImageUrls(item);
                            const lineName = isCustom
                              ? item.customName ?? "Custom item"
                              : item.product?.name ?? `Product #${item.productId}`;
                            const lineDesc = item.description?.trim();
                            const lineTotal = Number(item.unitPrice) * item.quantity;
                            return (
                              <TableRow key={item.id}>
                                <TableCell>
                                  <div className="flex items-start gap-3 min-w-[200px]">
                                    {photos.length > 0 ? (
                                      <button
                                        type="button"
                                        className="relative h-12 w-12 shrink-0 rounded-md border bg-muted overflow-hidden cursor-zoom-in hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        onClick={() => openUrlGallery(photos, 0)}
                                        aria-label={
                                          photos.length > 1
                                            ? `View ${photos.length} product images`
                                            : "View product image"
                                        }
                                      >
                                        <img
                                          src={photos[0]}
                                          alt={lineName}
                                          className="h-full w-full object-cover"
                                        />
                                        {photos.length > 1 ? (
                                          <span className="absolute bottom-0 inset-x-0 bg-black/65 text-[10px] font-medium text-white text-center leading-tight py-0.5">
                                            +{photos.length - 1}
                                          </span>
                                        ) : null}
                                      </button>
                                    ) : (
                                      <div className="h-12 w-12 rounded-md border bg-muted shrink-0 flex items-center justify-center">
                                        <Package className="h-4 w-4 text-muted-foreground" />
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <p className="font-medium text-sm">
                                        {lineName}
                                        {isCustom ? (
                                          <span className="ml-2 text-xs text-muted-foreground font-normal">(custom)</span>
                                        ) : null}
                                      </p>
                                      {lineDesc ? (
                                        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                                          {lineDesc}
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">
                                  {formatInr(Number(item.unitPrice))}
                                </TableCell>
                                <TableCell className="text-right font-medium tabular-nums">
                                  {formatInr(lineTotal)}
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
                            {formatInr(Number(po.totalAmount))}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </DetailSection>

              {(partnerUser || !can("purchaseOrders", "edit")) && po.notes?.trim() ? (
                <DetailSection title="Notes" description={partnerUser ? "Notes from MGR CASA" : "Internal notes for this PO"}>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{po.notes}</p>
                </DetailSection>
              ) : null}

              {!partnerUser ? (
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
                        {comment.createdAt ? formatDisplayDate(comment.createdAt, { includeTime: true }) : ""}
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
              ) : null}
            </div>

            {/* Sidebar — summary, status, vendor, schedule */}
            <aside className="space-y-6 lg:col-span-4 lg:sticky lg:top-4 lg:self-start">
              <DetailSection title="Summary" description="Amount and delivery">
                <div className="rounded-xl border bg-muted/15 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                      Total amount
                    </span>
                    <span className="text-xl font-bold tabular-nums">
                      {formatInr(Number(po.totalAmount))}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-start justify-between gap-2 text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      Expected delivery
                    </span>
                    <span className="font-medium text-right">{expectedDeliveryLabel}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Line items</span>
                    <span className="font-medium">{items.length}</span>
                  </div>
                </div>
                {!partnerUser && po.status === "delivered" ? (
                  <p className="text-xs text-muted-foreground rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-green-800">
                    Stock was added to inventory when this PO was marked delivered.
                  </p>
                ) : null}
              </DetailSection>

              {can("purchaseOrders", "edit") ? (
                <DetailSection
                  title={partnerUser ? "Delivery status" : "Status"}
                  description={partnerUser ? "Update progress for this order" : "Update procurement progress"}
                >
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
                      disabled={updateStatus.isPending || (partnerUser && ["cancelled", "delivered"].includes(po.status))}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Change status" />
                      </SelectTrigger>
                      <SelectContent>
                        {(partnerUser
                          ? [po.status, ...PARTNER_STATUS_OPTIONS].filter(
                              (v, i, a) => a.indexOf(v) === i,
                            )
                          : ALL_STATUSES
                        ).map((s) => (
                          <SelectItem key={s} value={s}>
                            {poStatusLabel(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </DetailSection>
              ) : null}

              {can("purchaseOrders", "edit") && !partnerUser ? (
                <DetailSection title="Schedule & notes" description="Expected delivery and internal notes">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Expected delivery</label>
                      <Input
                        type="date"
                        className="rounded-xl"
                        min={minDeliveryDate}
                        value={expectedDeliveryDraft}
                        onChange={(e) => setExpectedDeliveryDraft(e.target.value)}
                      />
                      {expectedDeliveryInPast ? (
                        <p className="text-xs text-destructive">
                          Expected delivery date cannot be in the past.
                        </p>
                      ) : null}
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
                      disabled={!detailsDirty || updatePo.isPending || expectedDeliveryInPast}
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

        {imageGallery ? (
          <OrderImageGalleryDialog
            open={!!imageGallery}
            slides={imageGallery.slides}
            index={imageGallery.index}
            onIndexChange={(index) => setImageGallery((current) => (current ? { ...current, index } : current))}
            onClose={() => setImageGallery(null)}
          />
        ) : null}
      </div>
    );
  }
