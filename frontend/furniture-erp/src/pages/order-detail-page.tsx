import { Link, Redirect, useRoute } from "wouter";
import {
  getGetOrderQueryKey,
  getListPaymentsQueryKey,
  useCreatePayment,
  useGetOrder,
  useGetSettings,
  useListPayments,
  useUpdateOrder,
} from "@/api-client";
import {
  ArrowLeft,
  Calendar,
  CalendarClock,
  IndianRupee,
  MapPin,
  Package,
  FileDown,
  MessageCircle,
  PencilLine,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useBranch, assignedUserBranchIds } from "@/lib/branch-context";
import { patchOrderDelivery } from "@/lib/delivery-api";
import { DELIVERY_SLOTS_ENABLED } from "@/lib/delivery-feature";
import { canUpdateOrderDeliveryStatus } from "@/lib/order-delivery-access";
import {
  OrderImageGalleryDialog,
  type GallerySlide,
} from "@/components/order-image-gallery-dialog";
import { OrderPaymentFollowUpPanel } from "@/components/payment-follow-up-panel";
import { formatPaymentStatusLabel, isPendingPaymentStatus } from "@/lib/payment-follow-up-api";
import { inclusiveUnitFromExclusive } from "@/lib/gst-pricing";
import { parseImageUrlsList, productImageList } from "@/lib/image-urls";
import { resolvedProductImageUrl } from "@/lib/product-image-url";
import { cn } from "@/lib/utils";
import {
  downloadOrderQuotationPdf,
  openWhatsAppForOrder,
  type OrderQuotationInput,
  type QuotationCompanySettings,
} from "@/lib/order-quotation-pdf";

type OrderLineItemRow = {
  id: number;
  isCustom?: boolean;
  customName?: string | null;
  customImageUrl?: string | null;
  customImageUrls?: string[] | string | null;
  description?: string | null;
  productId?: number | null;
  product?: { name?: string; imageUrl?: string | null; imageUrls?: string | string[] | null } | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  gstPercent?: number;  
};

function buildQuotationFromOrder(order: {
  orderNumber: string;
  createdAt: string;
  customerName: string;
  customerMobile?: string | null;
  customerAddress?: string | null;
  isGst: boolean;
  totalAmount: number;
  paidAmount?: number;
  items?: OrderLineItemRow[];
}, orderAny: Record<string, unknown>): OrderQuotationInput {
  const deliveryDate = orderAny.deliveryDate as string | null | undefined;
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    customerName: order.customerName,
    customerMobile: order.customerMobile,
    customerAddress: order.customerAddress,
    customerPincode: (orderAny.customerPincode as string | null) ?? null,
    customerGstNumber: (orderAny.customerGstNumber as string | null) ?? null,
    isGst: !!order.isGst,
    items: (order.items ?? []).map((item) => {
      const row = item as OrderLineItemRow;
      return {
        label: row.isCustom
          ? row.customName ?? "Custom item"
          : row.product?.name ?? `Product #${row.productId}`,
        description: row.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
        gstPercent: (item as { gstPercent?: number }).gstPercent,
        imageUrls: orderLineImageUrls(row),
      };
    }),
    subtotal: Number(orderAny.subtotal ?? 0),
    taxAmount: Number(orderAny.taxAmount ?? 0),
    totalAmount: Number(order.totalAmount),
    paidAmount: Number(order.paidAmount ?? 0),
    photoComments: (Array.isArray(orderAny.photoComments) ? orderAny.photoComments : []) as Array<{
      imageUrl?: string;
      comment?: string;
    }>,
    deliveryDate: deliveryDate ? String(deliveryDate).slice(0, 10) : null,
  };
}

function orderLineImageUrls(item: OrderLineItemRow): string[] {
  const raw = item.isCustom
    ? parseImageUrlsList(item.customImageUrls, item.customImageUrl)
    : item.product
      ? productImageList(item.product)
      : [];
  return raw.map((u) => resolvedProductImageUrl(u)).filter((u): u is string => Boolean(u));
}

function getStatusBadge(status: string) {
  switch (status) {
    case "order_received":
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Order Received</Badge>;
    case "manufacturing":
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Manufacturing</Badge>;
    case "ready_to_ship":
      return <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">Ready To Ship</Badge>;
    case "complete":
    case "delivered":
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Complete</Badge>;
    case "cancelled":
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Cancelled</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

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

function formatDeliverySlotDate(slotDate: string): string {
  try {
    const raw = String(slotDate).trim();
    const d = raw.includes("T") ? new Date(raw) : new Date(`${raw.slice(0, 10)}T00:00:00`);
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return slotDate;
  }
}

function deliveryStatusBadge(s: string) {
  switch (s) {
    case "pending":
      return <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">Delivery: Pending</Badge>;
    case "out_for_delivery":
      return <Badge variant="outline" className="bg-sky-50 text-sky-800 border-sky-200">Out for delivery</Badge>;
    case "delivered":
      return <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200">Delivery: Delivered</Badge>;
    default:
      return <Badge variant="outline">{s}</Badge>;
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

export default function OrderDetailPage() {
  const [, params] = useRoute("/orders/:id");
  const orderId = params?.id ? parseInt(params.id, 10) : NaN;

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { selectedBranchId } = useBranch();
  const assigned = assignedUserBranchIds(user);
  const headerBranchId =
    assigned.length === 1
      ? assigned[0]!
      : assigned.length > 1
        ? selectedBranchId != null && assigned.includes(selectedBranchId)
          ? selectedBranchId
          : null
        : selectedBranchId;
  const { data: order, isLoading, isError } = useGetOrder(orderId, {
    query: { enabled: Number.isFinite(orderId) && orderId > 0 },
  });
  const { data: settingsData } = useGetSettings();

  const [status, setStatus] = useState("order_received");
  const [deliveryStatus, setDeliveryStatus] = useState("pending");
  const [paymentStatus, setPaymentStatus] = useState("due");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentChequeNumber, setPaymentChequeNumber] = useState("");
  const [newStaffComment, setNewStaffComment] = useState("");
  const [showStaffCommentForm, setShowStaffCommentForm] = useState(false);
  const [newDeliveryComment, setNewDeliveryComment] = useState("");
  const [showDeliveryCommentForm, setShowDeliveryCommentForm] = useState(false);
  const [imageGallery, setImageGallery] = useState<{ slides: GallerySlide[]; index: number } | null>(null);
  const [quotationPdfLoading, setQuotationPdfLoading] = useState(false);

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

  const refreshOrderDetail = useCallback(
    async (id: number) => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: getGetOrderQueryKey(id) }),
        queryClient.refetchQueries({
          queryKey: getListPaymentsQueryKey({ orderId: id, limit: 100 }),
        }),
      ]);
    },
    [queryClient],
  );

  const updateOrder = useUpdateOrder({
    mutation: {
      onSuccess: (updated, { id }) => {
        if (updated) {
          queryClient.setQueryData(getGetOrderQueryKey(id), updated);
        }
        void refreshOrderDetail(id);
        toast({ title: "Order updated" });
      },
      onError: (error: any) => toast({ title: "Update failed", description: error?.response?.data?.error ?? error?.message, variant: "destructive" }),
    },
  });
  const createPayment = useCreatePayment({
    mutation: {
      onSuccess: (_payment, { data }) => {
        const id = data.orderId;
        void refreshOrderDetail(id);
        setPaymentAmount("");
        setPaymentNote("");
        setPaymentChequeNumber("");
        toast({ title: "Payment added" });
      },
      onError: (error: any) => toast({ title: "Payment failed", description: error?.response?.data?.error ?? error?.message, variant: "destructive" }),
    },
  });
  const { data: paymentsData } = useListPayments({ orderId, limit: 100 }, { query: { enabled: Number.isFinite(orderId) && orderId > 0 } });

  const patchDelivery = useMutation({
    mutationFn: async (next: "pending" | "out_for_delivery" | "delivered") => {
      if (!Number.isFinite(orderId)) throw new Error("Invalid order");
      return patchOrderDelivery(orderId, headerBranchId, { deliveryStatus: next });
    },
    onSuccess: () => {
      void refreshOrderDetail(orderId);
      toast({ title: "Delivery status updated" });
    },
    onError: (error: Error) =>
      toast({ title: "Update failed", description: error?.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (!order) return;
    const orderAny = order as any;
    setStatus(orderAny.status === "delivered" ? "complete" : (orderAny.status ?? "order_received"));
    setDeliveryStatus(orderAny.deliveryStatus ?? "pending");
    setPaymentStatus(orderAny.paymentStatus ?? "due");
    setPaymentMode(orderAny.paymentMode ?? "cash");
  }, [order]);

  if (!Number.isFinite(orderId) || orderId <= 0) return <Redirect to="/orders" />;
  if (isLoading) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading order…</div>;
  if (isError || !order) return <div className="text-muted-foreground">Order not found.</div>;

  const orderAny = order as any;
  /** Saved delivery status from server (Delivered option requires out_for_delivery to be saved first). */
  const serverDeliveryStatus = (orderAny.deliveryStatus ?? "pending") as string;
  const payments = paymentsData?.data ?? [];
  const challanImages: string[] = Array.isArray(orderAny.challanImages) ? orderAny.challanImages : [];
  const photoComments = Array.isArray(orderAny.photoComments) ? orderAny.photoComments : [];
  const sitePhotoSlides: GallerySlide[] = photoComments
    .filter((p: { imageUrl?: string }) => Boolean(p.imageUrl?.trim()))
    .map((p: { imageUrl: string; comment?: string }) => ({
      src: p.imageUrl,
      caption: p.comment?.trim() || null,
    }));
  const staffComments = Array.isArray(orderAny.staffComments) ? orderAny.staffComments : [];
  const deliveryComments = Array.isArray(orderAny.deliveryComments) ? orderAny.deliveryComments : [];
  const deliverySlot = DELIVERY_SLOTS_ENABLED
    ? (orderAny.deliverySlot as
        | {
            label: string;
            startTime: string;
            endTime: string;
            slotDate?: string;
          }
        | null
        | undefined)
    : null;
  const deliveryAssignees = Array.isArray(orderAny.deliveryAssignees) ? orderAny.deliveryAssignees : [];
  const canUpdateDelivery = canUpdateOrderDeliveryStatus(orderAny, user);
  const balance = Math.max(0, order.totalAmount - order.paidAmount);
  const showPaymentFollowUp = isPendingPaymentStatus(orderAny.paymentStatus);

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
    const next = [
      ...staffComments,
      {
        comment: text,
        authorName: user?.name ?? undefined,
        createdAt: new Date().toISOString(),
      },
    ];
    updateOrder.mutate({
      id: order.id,
      data: { staffComments: next } as any,
    });
    setNewStaffComment("");
    setShowStaffCommentForm(false);
  };

  const addDeliveryComment = () => {
    const text = newDeliveryComment.trim();
    if (!text) return;
    const next = [
      ...deliveryComments,
      {
        comment: text,
        authorName: user?.name ?? undefined,
        createdAt: new Date().toISOString(),
      },
    ];
    updateOrder.mutate({
      id: order.id,
      data: { deliveryComments: next } as any,
    });
    setNewDeliveryComment("");
    setShowDeliveryCommentForm(false);
  };

  const assigneeLabel =
    Array.isArray(orderAny.assignees) && orderAny.assignees.length > 0
      ? orderAny.assignees.map((a: { name?: string }) => a.name).filter(Boolean).join(", ")
      : orderAny.assignedTo?.name ?? null;

  const itemCount = order.items?.length ?? 0;

  const quotationCompany: QuotationCompanySettings = {
    companyName: settingsData?.companyName,
    address: settingsData?.address,
    phone: settingsData?.phone,
    email: settingsData?.email,
    gstNumber: settingsData?.gstNumber,
  };

  const quotationInput = buildQuotationFromOrder(order, orderAny as Record<string, unknown>);

  const handleDownloadQuotation = async () => {
    setQuotationPdfLoading(true);
    try {
      await downloadOrderQuotationPdf(quotationInput, quotationCompany);
      toast({ title: "Quotation PDF downloaded" });
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : typeof e === "string" ? e : "Try again.";
      console.error("Quotation PDF failed:", e);
      toast({
        title: "Could not generate quotation",
        description: message,
        variant: "destructive",
      });
    } finally {
      setQuotationPdfLoading(false);
    }
  };

  const handleWhatsAppShare = () => {
    openWhatsAppForOrder(quotationInput, quotationCompany);
  };

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-muted/40 -mx-4 -mt-4 px-4 py-6 md:-mx-8 md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <Link href="/orders">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-0.5 shrink-0 rounded-full"
                aria-label="Back to orders"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight font-mono md:text-2xl">{order.orderNumber}</h1>
                {getStatusBadge(order.status)}
                {deliveryStatusBadge(serverDeliveryStatus)}
                {order.isGst ? (
                  <Badge variant="outline" className="bg-violet-50 text-violet-800 border-violet-200 font-normal">
                    GST invoice
                  </Badge>
                ) : (
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    Non-GST
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                 {formatCommentDateTime(order.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900"
              onClick={handleWhatsAppShare}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              WhatsApp
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={quotationPdfLoading}
              onClick={() => void handleDownloadQuotation()}
            >
              <FileDown className="h-4 w-4 mr-2" />
              {quotationPdfLoading ? "Generating…" : "Quotation PDF"}
            </Button>
            <Link href={`/orders/${order.id}/edit`}>
              <Button type="button" variant="outline" size="sm" className="rounded-xl">
                <PencilLine className="h-4 w-4 mr-2" />
                Edit order
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            <DetailSection
              title="Order Details"
              description={`${itemCount} item${itemCount === 1 ? "" : "s"} on this order`}
            >
              <div className="rounded-lg border bg-muted/10 px-3 py-2.5 pb-3 mb-3 border-b border-border/50">
                <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
                  {order.customerName ? (
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Name</p>
                      <p className="font-medium text-foreground">{order.customerName}</p>
                    </div>
                  ) : null}
                  {order.customerMobile ? (
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Mobile</p>
                      <p className="font-mono text-foreground">{order.customerMobile}</p>
                    </div>
                  ) : null}
                  {order.customerAddress || orderAny.customerPincode ? (
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Address</p>
                      <p className="text-foreground flex items-start gap-1.5 leading-snug">
                        {/* <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" /> */}
                        <span>
                          {order.customerAddress ?? "—"}
                          {orderAny.customerPincode ? (
                            <span className="text-muted-foreground">
                              {order.customerAddress ? " · " : ""}
                              Pincode{" "}
                              <span className="font-mono text-foreground">{orderAny.customerPincode}</span>
                            </span>
                          ) : null}
                        </span>
                      </p>
                    </div>
                  ) : null}
                  {order.isGst && order.customerGstNumber ? (
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">GST</p>
                      <p className="font-mono text-foreground">{order.customerGstNumber}</p>
                    </div>
                  ) : null}
                </div>
              </div>

              {!order.items?.length ? (
                <p className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-xl">
                  No line items on this order.
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
                        {order.items.map((item) => {
                          const row = item as OrderLineItemRow;
                          const custom = !!row.isCustom;
                          const lineDesc = row.description?.trim();
                          const label = custom
                            ? row.customName ?? "Custom item"
                            : row.product?.name || `Product #${row.productId}`;
                          const lineImages = orderLineImageUrls(row);
                          return (
                            <TableRow key={item.id}>
                              <TableCell>
                                <div className="flex items-start gap-3 min-w-[200px]">
                                  {lineImages.length > 0 ? (
                                    <button
                                      type="button"
                                      className="relative h-12 w-12 shrink-0 rounded-md border bg-muted overflow-hidden cursor-zoom-in hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      onClick={() =>
                                        openUrlGallery(
                                          lineImages,
                                          0,
                                        )
                                      }
                                      aria-label={
                                        lineImages.length > 1
                                          ? `View ${lineImages.length} product images`
                                          : "View product image"
                                      }
                                    >
                                      <img
                                        src={lineImages[0]}
                                        alt={label}
                                        className="h-full w-full object-cover"
                                      />
                                      {lineImages.length > 1 ? (
                                        <span className="absolute bottom-0 inset-x-0 bg-black/65 text-[10px] font-medium text-white text-center leading-tight py-0.5">
                                          +{lineImages.length - 1}
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
                                      {label}
                                      {custom ? (
                                        <span className="ml-2 text-xs text-muted-foreground font-normal">(custom)</span>
                                      ) : null}
                                    </p>
                                    {lineDesc ? (
                                      <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{lineDesc}</p>
                                    ) : null}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                ₹
                                {(order.isGst && (item as { gstPercent?: number }).gstPercent
                                  ? inclusiveUnitFromExclusive(
                                      item.unitPrice,
                                      Number((item as { gstPercent?: number }).gstPercent ?? 0),
                                    )
                                  : item.unitPrice
                                ).toLocaleString()}
                                {order.isGst ? (
                                  <span className="block text-[10px] text-muted-foreground">incl. GST</span>
                                ) : null}
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                ₹{item.totalPrice.toLocaleString()}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex justify-end pt-2">
                    <div className="rounded-xl border bg-muted/20 px-4 py-3 min-w-[220px] space-y-2">
                      {order.isGst ? (
                        <>
                          <div className="flex justify-between gap-8 text-sm">
                            <span className="text-muted-foreground">Sub Total</span>
                            <span className="tabular-nums">₹{Number(orderAny.subtotal ?? 0).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between gap-8 text-sm">
                            <span className="text-muted-foreground">GST</span>
                            <span className="tabular-nums">₹{Number(orderAny.taxAmount ?? 0).toLocaleString()}</span>
                          </div>
                        </>
                      ) : null}
                      <div className="flex justify-between gap-8 text-sm">
                        <span className="text-muted-foreground">Order total{order.isGst ? " (incl. GST)" : ""}</span>
                        <span className="font-semibold tabular-nums">₹{order.totalAmount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </DetailSection>

            <DetailSection
              title="Challan & photos"
              description={`${challanImages.length} challan image${challanImages.length === 1 ? "" : "s"}`}
            >
              {challanImages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No challan images uploaded.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {challanImages.map((url, index) => (
                    <img
                      key={`${url}-${index}`}
                      src={url}
                      alt={`Challan ${index + 1}`}
                      className="h-24 w-24 rounded-md object-cover border cursor-zoom-in hover:opacity-90 transition-opacity"
                      onClick={() => openUrlGallery(challanImages, index)}
                    />
                  ))}
                </div>
              )}
              {photoComments.length > 0 ? (
                <div className="space-y-3 pt-2 border-t border-border/50">
                  <h3 className="text-sm font-medium">Photos and comments</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {photoComments.map((entry: { imageUrl?: string; comment?: string }, index: number) => (
                        <div
                          key={index}
                          className="overflow-hidden rounded-lg border border-border/60 bg-muted/10"
                        >
                          {entry.imageUrl ? (
                            <button
                              type="button"
                              className="relative block aspect-square w-full cursor-zoom-in overflow-hidden bg-muted/20 hover:opacity-95 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() =>
                                openImageGallery(
                                  sitePhotoSlides,
                                  sitePhotoSlides.findIndex((s) => s.src === entry.imageUrl),
                                )
                              }
                              aria-label={`View site photo ${index + 1}`}
                            >
                              <img
                                src={entry.imageUrl}
                                alt={`Site photo ${index + 1}`}
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ) : (
                            <div className="flex aspect-square items-center justify-center bg-muted/20 text-xs text-muted-foreground">
                              No photo
                            </div>
                          )}
                          <p
                            className="line-clamp-3 border-t border-border/50 px-2.5 py-2 pb-0 text-xs leading-snug text-foreground/90"
                            title={entry.comment?.trim() || undefined}
                          >
                            {entry.comment?.trim() || "No comment"}
                          </p>
                        </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </DetailSection>

            <DetailSection
              title="Staff comments"
              description="Internal notes visible to staff"
              action={
                !showStaffCommentForm ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowStaffCommentForm(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                ) : undefined
              }
            >
              {staffComments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No staff comments yet.</p>
              ) : (
                <div className="space-y-2">
                  {staffComments.map(
                    (comment: { comment?: string; authorName?: string; createdAt?: string }, index: number) => (
                      <div key={index} className="rounded-md border bg-muted/20 p-3 text-sm space-y-1">
                        <p className="whitespace-pre-wrap">{comment.comment || "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {comment.authorName ? `${comment.authorName} · ` : ""}
                          {comment.createdAt ? formatCommentDateTime(comment.createdAt) : ""}
                        </p>
                      </div>
                    ),
                  )}
                </div>
              )}
              {showStaffCommentForm ? (
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <Textarea
                    value={newStaffComment}
                    onChange={(e) => setNewStaffComment(e.target.value)}
                    placeholder="Enter staff comment"
                    rows={3}
                    autoFocus
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addStaffComment}
                      disabled={!newStaffComment.trim() || updateOrder.isPending}
                    >
                      <PencilLine className="h-4 w-4 mr-2" />
                      Add comment
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

            <DetailSection
              title="Delivery notes"
              description="Driver instructions, gate codes, reschedule notes"
              action={
                !showDeliveryCommentForm ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowDeliveryCommentForm(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                ) : undefined
              }
            >
              {deliveryComments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No delivery notes yet.</p>
              ) : (
                <div className="space-y-2">
                  {deliveryComments.map(
                    (entry: { comment?: string; authorName?: string; createdAt?: string }, index: number) => (
                      <div key={index} className="rounded-md border bg-muted/20 p-3 text-sm space-y-1">
                        <p className="whitespace-pre-wrap">{entry.comment || "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.authorName ? `${entry.authorName} · ` : ""}
                          {entry.createdAt ? formatCommentDateTime(entry.createdAt) : ""}
                        </p>
                      </div>
                    ),
                  )}
                </div>
              )}
              {showDeliveryCommentForm ? (
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <Textarea
                    value={newDeliveryComment}
                    onChange={(e) => setNewDeliveryComment(e.target.value)}
                    placeholder="Gate code, driver instructions, reschedule notes, etc."
                    rows={3}
                    autoFocus
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addDeliveryComment}
                      disabled={!newDeliveryComment.trim() || updateOrder.isPending}
                    >
                      <PencilLine className="h-4 w-4 mr-2" />
                      Add delivery note
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setNewDeliveryComment("");
                        setShowDeliveryCommentForm(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </DetailSection>

            {showPaymentFollowUp ? 
            <div className="">
            <OrderPaymentFollowUpPanel orderId={order.id} /> 
            </div>
            : null}

            {assigneeLabel || orderAny.createdBy?.name ? (
              <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-dashed border-border/50 bg-muted/5 px-3 py-2 text-xs text-muted-foreground">
                {assigneeLabel ? (
                  <span>
                    Assigned to: <span className="font-medium text-foreground">{assigneeLabel}</span>
                  </span>
                ) : null}
                {orderAny.createdBy?.name ? (
                  <span>
                    Created by: <span className="font-medium text-foreground">{orderAny.createdBy.name}</span>
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <aside className="space-y-6 lg:col-span-4 lg:sticky lg:top-4 lg:self-start">
            <DetailSection title="Payment summary" description="Totals and balance">
              <div className="rounded-xl border bg-muted/15 p-4 space-y-3">
                {order.isGst ? (
                  <>
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">Sub Total</span>
                      <span className="tabular-nums">₹{Number(orderAny.subtotal ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">GST</span>
                      <span className="tabular-nums">₹{Number(orderAny.taxAmount ?? 0).toLocaleString()}</span>
                    </div>
                    <Separator />
                  </>
                ) : null}
                {Number(orderAny.deliveryCharge ?? 0) > 0 ? (
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Delivery charge</span>
                    <span className="tabular-nums">₹{Number(orderAny.deliveryCharge).toLocaleString()}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <IndianRupee className="h-4 w-4" />
                    Total{order.isGst ? " (incl. GST)" : ""}
                  </span>
                  <span className="text-xl font-bold tabular-nums">₹{order.totalAmount.toLocaleString()}</span>
                </div>
                <Separator />
                <div className="flex justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="font-medium text-green-700 tabular-nums">₹{order.paidAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Due Amount</span>
                  <span className="font-semibold tabular-nums">₹{balance.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Payment status</span>
                  <span className="font-medium">{formatPaymentStatusLabel(orderAny.paymentStatus)}</span>
                </div>
              </div>
            </DetailSection>

            <DetailSection title="Record payment" description="Add payments against this order">
              <div className="space-y-3">
                <div
                  className={cn(
                    "grid grid-cols-1 gap-3",
                    paymentMode === "cheque" ? "sm:grid-cols-2" : "sm:grid-cols-1",
                  )}
                >
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Amount"
                    className="rounded-xl"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                  />
                  <Select value={paymentMode} onValueChange={setPaymentMode}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                  {paymentMode === "cheque" ? (
                    <Input
                      placeholder="Cheque number"
                      className="rounded-xl sm:col-span-2"
                      value={paymentChequeNumber}
                      onChange={(e) => setPaymentChequeNumber(e.target.value)}
                    />
                  ) : null}
                  <Input
                    placeholder="Payment note (optional)"
                    className="rounded-xl sm:col-span-2"
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  className="w-full rounded-xl"
                  onClick={() => {
                    if (paymentMode === "cheque" && !paymentChequeNumber.trim()) {
                      toast({ title: "Cheque number required", variant: "destructive" });
                      return;
                    }
                    const payload: Record<string, unknown> = {
                      orderId: order.id,
                      amount: Number(paymentAmount || 0),
                      mode: paymentMode,
                      notes: paymentNote || null,
                    };
                    if (paymentMode === "cheque") payload.chequeNumber = paymentChequeNumber.trim();
                    createPayment.mutate({ data: payload as any });
                  }}
                  disabled={
                    !paymentAmount ||
                    createPayment.isPending ||
                    (paymentMode === "cheque" && !paymentChequeNumber.trim())
                  }
                >
                  Add payment
                </Button>
                {payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {payments.map(
                      (payment: {
                        id: number;
                        mode: string;
                        amount: number;
                        chequeNumber?: string | null;
                        notes?: string | null;
                        recordedBy?: string | null;
                        createdBy?: { name?: string } | null;
                        createdAt: string;
                      }) => {
                        const recordedBy =
                          payment.recordedBy ?? payment.createdBy?.name ?? null;
                        return (
                          <div key={payment.id} className="rounded-md border bg-muted/20 p-3 text-sm space-y-1">
                            <p>
                              <span className="capitalize">{payment.mode}</span>
                              {payment.mode === "cheque" && payment.chequeNumber
                                ? ` #${payment.chequeNumber}`
                                : ""}
                              {" — "}
                              <span className="font-medium">₹{payment.amount.toLocaleString()}</span>
                              {payment.notes ? (
                                <span className="text-muted-foreground"> · {payment.notes}</span>
                              ) : null}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {recordedBy ? `${recordedBy} · ` : ""}
                              {formatCommentDateTime(payment.createdAt)}
                            </p>
                          </div>
                        );
                      },
                    )}
                  </div>
                )}
                <p className="text-sm font-medium text-muted-foreground">
                  Remaining: <span className="text-foreground font-semibold">₹{balance.toLocaleString()}</span>
                </p>
              </div>
            </DetailSection>

            <DetailSection title="Delivery status" description="Driver, charge, and logistics status">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">{deliveryStatusBadge(serverDeliveryStatus)}</div>
                {orderAny.driver?.name ? (
                  <p className="text-sm">
                    Driver:{" "}
                    <Link
                      href={`/drivers/${orderAny.driver.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {orderAny.driver.name}
                    </Link>
                    {orderAny.driver.mobile ? (
                      <span className="text-muted-foreground"> · {orderAny.driver.mobile}</span>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No driver assigned</p>
                )}
                {Number(orderAny.deliveryCharge ?? 0) > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Delivery charge:{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      ₹{Number(orderAny.deliveryCharge).toLocaleString()}
                    </span>
                  </p>
                ) : null}
                {deliveryAssignees.length > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Delivery assignees:{" "}
                    <span className="text-foreground">
                      {deliveryAssignees.map((u: { name?: string }) => u.name).filter(Boolean).join(", ")}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No delivery assignees — only Super Admin can update status.</p>
                )}
                {deliverySlot ? (
                  <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5 text-sm space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Scheduled delivery
                    </p>
                    {deliverySlot.slotDate ? (
                      <p className="font-medium text-foreground flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {formatDeliverySlotDate(deliverySlot.slotDate)}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground">
                      {deliverySlot.label}{" "}
                      <span className="font-mono text-foreground">
                        ({deliverySlot.startTime}–{deliverySlot.endTime})
                      </span>
                    </p>
                  </div>
                ) : null}
                {canUpdateDelivery ? (
                  <>
                    <Select value={deliveryStatus} onValueChange={(v) => setDeliveryStatus(v as typeof deliveryStatus)}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem
                          value="out_for_delivery"
                          disabled={status !== "ready_to_ship"}
                          title={
                            status !== "ready_to_ship"
                              ? "Set main order status to Ready to ship first"
                              : undefined
                          }
                        >
                          Out for delivery
                        </SelectItem>
                        <SelectItem
                          value="delivered"
                          disabled={serverDeliveryStatus !== "out_for_delivery"}
                          title={
                            serverDeliveryStatus !== "out_for_delivery"
                              ? "Save Out for delivery first, then you can mark Delivered"
                              : undefined
                          }
                        >
                          Delivered
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full rounded-xl"
                      disabled={
                        patchDelivery.isPending ||
                        deliveryStatus === serverDeliveryStatus ||
                        (deliveryStatus === "out_for_delivery" && status !== "ready_to_ship") ||
                        (deliveryStatus === "delivered" && serverDeliveryStatus !== "out_for_delivery")
                      }
                      onClick={() =>
                        patchDelivery.mutate(deliveryStatus as "pending" | "out_for_delivery" | "delivered")
                      }
                    >
                      Save delivery status
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Only delivery assignees or Super Admin can change delivery status.
                  </p>
                )}
              </div>
            </DetailSection>

            <DetailSection title="Order status" description="Manufacturing progress and payment status">
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Order status</p>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="order_received">Order Received</SelectItem>
                      <SelectItem value="manufacturing">Manufacturing</SelectItem>
                      <SelectItem value="ready_to_ship">Ready To Ship</SelectItem>
                      <SelectItem value="complete">Complete</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Payment status</p>
                  <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="due">Due</SelectItem>
                      <SelectItem value="partially_paid">Partially Paid</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  className="w-full rounded-xl"
                  onClick={applyStatusUpdate}
                  disabled={updateOrder.isPending}
                >
                  Update status
                </Button>
              </div>
            </DetailSection>
          </aside>
        </div>
      </div>

      <OrderImageGalleryDialog
        open={!!imageGallery}
        slides={imageGallery?.slides ?? []}
        index={imageGallery?.index ?? 0}
        onIndexChange={(next) =>
          setImageGallery((g) => (g ? { ...g, index: next } : g))
        }
        onClose={() => setImageGallery(null)}
      />
    </div>
  );
}

