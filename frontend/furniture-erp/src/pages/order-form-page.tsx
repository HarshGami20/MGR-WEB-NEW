import { useEffect, useMemo, useState, useCallback, useRef, type ComponentProps, type ReactNode } from "react";
import { Link, Redirect, useLocation, useRoute } from "wouter";
import {
  useCreateOrder,
  useGetOrder,
  useListAssignableOrderUsers,
  useListProducts,
  useGetSettings,
  useUpdateOrder,
  getGetOrderQueryKey,
  getListOrdersQueryKey,
  getListProductsQueryKey,
} from "@/api-client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, ImageIcon, IndianRupee, Plus, Trash2, Upload, X } from "lucide-react";
import { z } from "zod";
import { useFieldArray, useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AssigneesMultiSelect } from "@/components/assignees-multi-select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage as BaseFormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { formatPaymentStatusLabel } from "@/lib/payment-follow-up-api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useBranch, assignedUserBranchIds } from "@/lib/branch-context";
import { usePermissions } from "@/lib/permissions";
import { LineItemRow } from "@/components/line-item-row";
import { lineItemFormSchema, lineItemToApiPayload } from "@/lib/line-item-form-schema";
import { defaultCatalogLineItem } from "@/lib/custom-line-item";
import { GoogleAddressInput } from "@/components/google-address-input";
import { fetchAvailableDeliverySlots, type AvailableDeliverySlot } from "@/lib/delivery-api";
import { listDrivers } from "@/lib/driver-api";
import { DELIVERY_SLOTS_ENABLED } from "@/lib/delivery-feature";
import { formatInr } from "@/lib/format-currency";
import { computeOrderTotalsFromLines } from "@/lib/gst-pricing";
import { zodFields } from "@/lib/form-validation";
import { ValidatedInput } from "@/components/validated-input";
import { getAuthToken } from "@/lib/auth-storage";
import { buildOrderFormValues } from "@/lib/order-form-values";
import type { Driver } from "@/lib/driver-api";

const EMPTY_AVAIL_SLOTS: AvailableDeliverySlot[] = [];

const orderSchema = z.object({
  customerName: zodFields.customerName(),
  customerMobile: zodFields.mobileRequired(),
  customerAddress: zodFields.addressOptional(),
  deliverySlotId: z
    .union([z.number().int().positive(), z.null()])
    .optional()
    .nullable(),
  googlePlaceId: z.string().optional().nullable(),
  addressLat: z.coerce.number().nullable().optional(),
  addressLng: z.coerce.number().nullable().optional(),
  isGst: z.boolean(),
  customerGstNumber: zodFields.gstNumberOptional(),
  items: z.array(lineItemFormSchema).min(1, "At least one item is required"),
  status: z.string().default("order_received"),
  paymentStatus: z.string().default("due"),
  advanceAmount: z.coerce.number().min(0).default(0),
  paymentMode: z.string().default("cash"),
  assigneeUserIds: z.array(z.number().int().positive()).optional().default([]),
  deliveryAssigneeUserIds: z.array(z.number().int().positive()).optional().default([]),
  deliveryDate: z.string().nullable().optional(),
  deliveryCharge: z.coerce.number().min(0).optional().default(0),
  driverId: z.number().int().positive().nullable().optional(),
  challanImages: z
    .array(
      z.object({
        imageUrl: z.string().min(1, "Upload a challan photo before saving"),
      }),
    )
    .default([]),
  photoComments: z.array(z.object({
    imageUrl: z.string().optional().default(""),
    comment: z.string().optional().default(""),
  })).default([]),
  staffCommentsText: z.string().optional().default(""),
  deliveryCommentsText: z.string().optional().default(""),
}).superRefine((data, ctx) => {
  if (data.isGst && !data.customerGstNumber?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customerGstNumber"],
      message: "GST number is required when GST invoice is enabled",
    });
  }
  const totals = computeOrderTotalsFromLines(
    data.items.map((item) => ({
      unitPrice: Number(item.unitPrice || 0),
      quantity: Number(item.quantity || 0),
      gstPercent: Number(item.gstPercent || 0),
    })),
    data.isGst,
  );
  if (Number(data.advanceAmount || 0) > totals.total) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["advanceAmount"],
      message: `exceed order total (${formatInr(totals.total)})`,
    });
  }
});

type OrderFormValues = z.infer<typeof orderSchema>;

function FormMessage({ className, ...props }: ComponentProps<typeof BaseFormMessage>) {
  return <BaseFormMessage className={cn("static mt-1", className)} {...props} />;
}

function collectFormErrorMessages(err: unknown): string[] {
  if (!err || typeof err !== "object") return [];
  const e = err as Record<string, unknown>;
  if (typeof e.message === "string" && e.message.trim()) return [e.message];
  return Object.values(e).flatMap(collectFormErrorMessages);
}

const ORDER_STATUS_OPTIONS = [
  { value: "order_received", label: "Order Received" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "ready_to_ship", label: "Ready To Ship" },
  { value: "complete", label: "Complete" },
  { value: "cancelled", label: "Cancelled" },
];
const PAYMENT_STATUS_OPTIONS = [
  { value: "due", label: "Due" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "paid", label: "Paid" },
];
const PAYMENT_MODE_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
];
const GST_INVOICE_OPTIONS = [
  { value: "gst", label: "Yes" },
  { value: "non_gst", label: "No" },
] as const;

const ORDER_FORM_DEFAULTS: OrderFormValues = {
  customerName: "",
  customerMobile: "",
  customerAddress: "",
  deliverySlotId: null,
  googlePlaceId: "",
  addressLat: null,
  addressLng: null,
  isGst: false,
  customerGstNumber: "",
  items: [{ ...defaultCatalogLineItem }],
  status: "order_received",
  paymentStatus: "due",
  advanceAmount: 0,
  paymentMode: "cash",
  assigneeUserIds: [],
  deliveryAssigneeUserIds: [],
  deliveryDate: null,
  deliveryCharge: 0,
  driverId: null,
  challanImages: [{ imageUrl: "" }],
  photoComments: [{ imageUrl: "", comment: "" }],
  staffCommentsText: "",
  deliveryCommentsText: "",
};

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm md:p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-xs text-muted-foreground mt-0.5">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function formatDeliveryDateLabel(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const raw = String(value).trim();
    const d = raw.includes("T") ? new Date(raw) : new Date(`${raw.slice(0, 10)}T00:00:00`);
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return String(value);
  }
}

async function uploadOrderImage(file: File, branchId: number | null | undefined): Promise<string> {
  const token = getAuthToken();
  const fd = new FormData();
  fd.append("image", file);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (branchId != null && Number.isFinite(branchId)) headers["X-Branch-Id"] = String(branchId);
  const resp = await fetch("/api/orders/upload-image", {
    method: "POST",
    headers,
    body: fd,
  });
  const raw = await resp.text();
  if (!resp.ok) {
    let detail = "Failed to upload image";
    try {
      const j = JSON.parse(raw) as { error?: string; message?: string };
      detail = j.error || j.message || detail;
    } catch {
      if (raw.trim()) detail = raw.slice(0, 200);
    }
    throw new Error(detail);
  }
  const data = JSON.parse(raw) as { imageUrl: string };
  return data.imageUrl;
}

function OrderFormPage({ mode }: { mode: "create" | "edit" }) {
  const [, params] = useRoute("/orders/:id/edit");
  const orderId = params?.id ? parseInt(params.id, 10) : NaN;
  const isEdit = mode === "edit";
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { selectedBranchId } = useBranch();
  const assigned = assignedUserBranchIds(user);
  const writeBranchId =
    assigned.length === 1
      ? assigned[0]!
      : assigned.length > 1
        ? selectedBranchId != null && assigned.includes(selectedBranchId)
          ? selectedBranchId
          : null
        : selectedBranchId;

  const { data: productsData } = useListProducts({ limit: 1000 });
  const { data: settingsData } = useGetSettings();
  const defaultGstPercent = settingsData?.defaultGstPercent ?? 18;
  const { data: assignableUsersData, isError: assignableUsersError } = useListAssignableOrderUsers(
    writeBranchId != null ? { branchId: writeBranchId, limit: 1000 } : undefined,
    { query: { enabled: writeBranchId != null } },
  );
  const { data: order, isLoading: orderLoading, isError: orderError } = useGetOrder(orderId, {
    query: {
      enabled: isEdit && Number.isFinite(orderId) && orderId > 0,
      refetchOnWindowFocus: false,
    },
  });

  const [uploading, setUploading] = useState(false);
  const [editFormHydrated, setEditFormHydrated] = useState(false);
  const editHydratedForOrderRef = useRef<number | null>(null);

  const createOrder = useCreateOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        toast({ title: "Order created successfully" });
        setLocation("/orders");
      },
      onError: (error: any) =>
        toast({
          title: "Failed to create order",
          description: error?.response?.data?.error ?? error?.message ?? "Please try again.",
          variant: "destructive",
        }),
    },
  });

  const updateOrder = useUpdateOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        if (Number.isFinite(orderId)) {
          queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
        }
        toast({ title: "Order updated successfully" });
        setLocation("/orders");
      },
      onError: (error: any) =>
        toast({
          title: "Failed to update order",
          description: error?.response?.data?.error ?? error?.message ?? "Please try again.",
          variant: "destructive",
        }),
    },
  });

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    mode: "onBlur",
    defaultValues: ORDER_FORM_DEFAULTS,
  });

  const { reset } = form;

  useEffect(() => {
    if (!isEdit) {
      editHydratedForOrderRef.current = null;
      setEditFormHydrated(false);
      return;
    }
    if (!order?.id || order.id !== orderId) {
      editHydratedForOrderRef.current = null;
      setEditFormHydrated(false);
      return;
    }
    if (editHydratedForOrderRef.current === order.id) return;
    editHydratedForOrderRef.current = order.id;
    reset(buildOrderFormValues(order as Parameters<typeof buildOrderFormValues>[0]) as OrderFormValues, {
      keepDefaultValues: false,
    });
    setEditFormHydrated(true);
  }, [isEdit, orderId, order, reset]);

  const deliveryDateWatch = form.watch("deliveryDate");

  const { data: slotOptionsRaw } = useQuery({
    queryKey: ["availableSlots", writeBranchId, deliveryDateWatch, isEdit ? orderId : 0],
    queryFn: () =>
      fetchAvailableDeliverySlots({
        branchId: writeBranchId!,
        date: String(deliveryDateWatch).slice(0, 10),
        excludeOrderId: isEdit && Number.isFinite(orderId) ? orderId : undefined,
      }),
    enabled:
      DELIVERY_SLOTS_ENABLED &&
      writeBranchId != null &&
      !!deliveryDateWatch &&
      String(deliveryDateWatch).trim().length >= 8,
  });
  const slotOptions = slotOptionsRaw ?? EMPTY_AVAIL_SLOTS;
  const { setValue, getValues } = form;

  const freeSlotIds = useMemo(
    () => slotOptions.filter((s) => s.remaining > 0).map((s) => s.id),
    [slotOptions],
  );

  useEffect(() => {
    if (!DELIVERY_SLOTS_ENABLED || !deliveryDateWatch || freeSlotIds.length === 0) return;
    const cur = getValues("deliverySlotId");
    if (cur != null && freeSlotIds.includes(cur)) return;
    const nextId = freeSlotIds[0]!;
    if (cur === nextId) return;
    setValue("deliverySlotId", nextId, { shouldDirty: false, shouldTouch: false, shouldValidate: false });
  }, [deliveryDateWatch, freeSlotIds, getValues, setValue]);

  const onGoogleResolved = useCallback(
    (sel: import("@/components/google-address-input").GoogleAddressSelection) => {
      if (sel.placeId) form.setValue("googlePlaceId", sel.placeId);
      form.setValue("addressLat", sel.lat ?? null);
      form.setValue("addressLng", sel.lng ?? null);
    },
    [form],
  );

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });
  const photoFields = useFieldArray({ control: form.control, name: "photoComments" });
  const defaultAssigneesAppliedRef = useRef<string>("");

  const assignableUsers = useMemo(
    () => assignableUsersData?.data ?? [],
    [assignableUsersData?.data],
  );

  const { data: driversData } = useQuery({
    queryKey: ["drivers", writeBranchId, "order-form"],
    queryFn: () => listDrivers({ branchId: writeBranchId!, limit: 200, isActive: true }),
    enabled: writeBranchId != null,
  });
  const driverOptions = useMemo(() => {
    const list = driversData?.data ?? [];
    if (!isEdit || !order) return list;
    const orderAny = order as { driver?: Driver | null; driverId?: number | null };
    const assignedId = orderAny.driver?.id ?? orderAny.driverId;
    if (assignedId == null || list.some((d) => d.id === assignedId)) return list;
    if (orderAny.driver) return [orderAny.driver, ...list];
    return list;
  }, [driversData?.data, isEdit, order]);

  useEffect(() => {
    if (isEdit || writeBranchId == null) return;
    if (assignableUsers.length === 0) return;
    const key = String(writeBranchId);
    if (defaultAssigneesAppliedRef.current === key) return;
    defaultAssigneesAppliedRef.current = key;

    const ids = new Set<number>();
    if (user?.id != null && assignableUsers.some((u) => u.id === user.id)) {
      ids.add(user.id);
    }
    for (const u of assignableUsers) {
      if (u.roleName === "Super Admin") ids.add(u.id);
    }
    if (ids.size > 0) {
      setValue("assigneeUserIds", [...ids], { shouldDirty: false, shouldTouch: false, shouldValidate: false });
    }
  }, [isEdit, writeBranchId, assignableUsers, user?.id, setValue]);

  const watchedItems = (useWatch({ control: form.control, name: "items" }) ?? []) as OrderFormValues["items"];
  const watchedAdvance = useWatch({ control: form.control, name: "advanceAmount" });
  const watchedPaymentStatus = useWatch({ control: form.control, name: "paymentStatus" });
  const watchedDeliverySlotId = useWatch({ control: form.control, name: "deliverySlotId" });
  const isGstInvoice = !!useWatch({ control: form.control, name: "isGst" });
  const orderSummary = useMemo(() => {
    const totals = computeOrderTotalsFromLines(
      watchedItems.map((item) => ({
        unitPrice: Number(item?.unitPrice || 0),
        quantity: Number(item?.quantity || 0),
        gstPercent: Number(item?.gstPercent || 0),
      })),
      isGstInvoice,
    );
    const advance = Number(watchedAdvance ?? 0);
    return {
      ...totals,
      remaining: Math.max(0, totals.total - advance),
    };
  }, [watchedItems, watchedAdvance, isGstInvoice]);

  const paidAmountDisplay =
    isEdit && order ? Number(order.paidAmount ?? 0) : Number(watchedAdvance ?? 0);
  const balanceAmountDisplay = Math.max(0, orderSummary.total - paidAmountDisplay);
  const selectedSlot =
    isEdit && order
      ? ((order as { deliverySlot?: { label: string; startTime: string; endTime: string; slotDate?: string } })
          .deliverySlot ?? null)
      : slotOptions.find((s) => s.id === watchedDeliverySlotId) ?? null;

  const handleUploadToFieldArray = async (
    file: File | undefined,
    apply: (imageUrl: string) => void,
  ) => {
    if (!file) return;
    try {
      setUploading(true);
      const imageUrl = await uploadOrderImage(file, writeBranchId);
      apply(imageUrl);
      toast({ title: "Image uploaded" });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error?.message ?? "Please try again", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = (data: OrderFormValues) => {
    if (writeBranchId == null) {
      toast({
        title: "Select a branch",
        description: "Choose a working branch in the header before saving this order.",
        variant: "destructive",
      });
      return;
    }

    for (let i = 0; i < data.items.length; i += 1) {
      const item = data.items[i];
      if (item.isCustom) continue;
      const product = productsData?.data?.find((p) => p.id === Number(item.productId));
      if (product?.variantCount && product.variantCount > 0 && !item.variantId) {
        form.setError(`items.${i}.productId`, { message: "Please select a variant for this product" });
        return;
      }
    }

    const payload = {
      customerName: data.customerName,
      customerMobile: data.customerMobile || null,
      customerAddress: data.customerAddress?.trim() || null,
      deliverySlotId: DELIVERY_SLOTS_ENABLED ? (data.deliverySlotId ?? null) : null,
      googlePlaceId: data.googlePlaceId?.trim() || null,
      addressLat: data.addressLat ?? null,
      addressLng: data.addressLng ?? null,
      isGst: !!data.isGst,
      customerGstNumber: data.customerGstNumber || null,
      items: data.items.map((item) => lineItemToApiPayload(item)),
      status: isEdit ? data.status : "order_received",
      paymentStatus: data.paymentStatus,
      advanceAmount: Number(data.advanceAmount ?? 0),
      paymentMode: data.paymentMode || "cash",
      assigneeUserIds: (data.assigneeUserIds ?? []).filter((id) => Number.isFinite(id) && id > 0),
      deliveryAssigneeUserIds: (data.deliveryAssigneeUserIds ?? []).filter(
        (id) => Number.isFinite(id) && id > 0,
      ),
      deliveryDate: data.deliveryDate || null,
      deliveryCharge: Number(data.deliveryCharge ?? 0),
      driverId: data.driverId ?? null,
      challanImages: data.challanImages.map((x) => x.imageUrl).filter(Boolean),
      photoComments: data.photoComments
        .filter((entry) => entry.imageUrl || entry.comment)
        .map((entry) => ({ imageUrl: entry.imageUrl || "", comment: entry.comment || "" })),
      staffComments: data.staffCommentsText
        ? data.staffCommentsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((comment) => ({ comment, createdAt: new Date().toISOString() }))
        : [],
      deliveryComments: data.deliveryCommentsText
        ? data.deliveryCommentsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((comment) => ({ comment, createdAt: new Date().toISOString() }))
        : [],
      notes: isEdit && order != null ? ((order as { notes?: string | null }).notes ?? null) : null,
      branchId: writeBranchId,
    };

    if (isEdit) {
      updateOrder.mutate({ id: orderId, data: payload as any });
      return;
    }
    createOrder.mutate({ data: payload as any });
  };

  const onSubmitInvalid = useCallback(
    (errors: FieldErrors<OrderFormValues>) => {
      const msgs = collectFormErrorMessages(errors);
      const summary = msgs.slice(0, 4).join(" · ");
      toast({
        title: "Cannot save — fix the issues below",
        description: summary || "Some required fields are missing or invalid.",
        variant: "destructive",
      });
      requestAnimationFrame(() => {
        document.querySelector("form [aria-invalid='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    },
    [toast],
  );

  const pending = createOrder.isPending || updateOrder.isPending;

  const lastUpdatedLabel = useMemo(() => {
    if (!isEdit || !order) return null;
    const raw = (order as { updatedAt?: string }).updatedAt;
    if (!raw) return null;
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(raw));
    } catch {
      return String(raw);
    }
  }, [isEdit, order]);

  if (isEdit && (!Number.isFinite(orderId) || orderId <= 0)) return <Redirect to="/orders" />;
  if (!isEdit && !can("orders", "add")) return <Redirect to="/orders" />;
  if (isEdit && !can("orders", "edit")) return <Redirect to={`/orders/${orderId}`} />;
  if (isEdit && (orderLoading || !order || !editFormHydrated)) {
    return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading order…</div>;
  }
  if (isEdit && orderError) return <div className="text-muted-foreground">Order not found.</div>;

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-muted/40 -mx-4 -mt-4 px-4 py-6 md:-mx-8 md:px-8 md:py-8">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onSubmitInvalid)} className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <Link href="/orders">
                <Button type="button" variant="ghost" size="icon" className="mt-0.5 shrink-0 rounded-full">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{isEdit ? "Edit order" : "Create order"}</h1>
                  {isEdit ? (
                    <Badge variant="secondary" className="font-normal">
                      #{orderId}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="font-normal">
                      New
                    </Badge>
                  )}
                </div>
                {/* <p className="text-sm text-muted-foreground">Customer, line items, delivery slot, payment, and proof photos.</p> */}
                {lastUpdatedLabel ? <p className="text-xs text-muted-foreground">Last updated {lastUpdatedLabel}</p> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href="/orders">
                <Button type="button" variant="outline" className="rounded-xl px-5">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" className="rounded-xl px-6 shadow-sm" disabled={pending || uploading}>
                {uploading ? (
                  <>
                    <Upload className="mr-2 h-4 w-4 animate-pulse" /> Uploading…
                  </>
                ) : isEdit ? (
                  "Save changes"
                ) : (
                  "Create order"
                )}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="order-1 space-y-6 lg:order-2 lg:col-span-8">
            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm md:p-6 space-y-4">
              <div>
                <h2 className="text-base font-semibold tracking-tight">Order details</h2>
                <p className="text-xs text-muted-foreground">Customer identity and delivery address.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3">
                <FormField control={form.control} name="customerName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Name*</FormLabel>
                    <FormControl>
                      <ValidatedInput field={field} rule="customerName" placeholder="Enter customer name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="customerMobile" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobile*</FormLabel>
                    <FormControl>
                      <ValidatedInput field={field} rule="mobile" placeholder="10-digit mobile" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 sm:items-start">
                <FormField
                  control={form.control}
                  name="isGst"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GST Invoice</FormLabel>
                      <Select
                        key={`gst-invoice-${field.value ? "yes" : "no"}`}
                        value={field.value ? "gst" : "non_gst"}
                        onValueChange={(v) => {
                          const isGst = v === "gst";
                          field.onChange(isGst);
                          if (!isGst) form.setValue("customerGstNumber", "");
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="mb-0">
                            <SelectValue  placeholder="Select GST type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {GST_INVOICE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* <p className="text-xs text-muted-foreground">
                        {field.value ? "Unit prices include GST" : "No GST invoice — prices without GST billing"}
                      </p> */}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="customerGstNumber"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>GST Number{isGstInvoice ? "*" : ""}</FormLabel>
                      <FormControl>
                        <ValidatedInput
                          field={field}
                          rule="gstNumber"
                          placeholder="Enter GST number"
                          disabled={!isGstInvoice}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                  
              </div>

              
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                <FormField control={form.control} name="customerAddress" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <GoogleAddressInput
                        value={field.value || ""}
                        onChangeAddress={field.onChange}
                        onResolved={onGoogleResolved}
                        placeholder="Search or type address (optional)"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField
                  control={form.control}
                  name="assigneeUserIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assign to (team)</FormLabel>
                      <AssigneesMultiSelect
                        options={assignableUsers.map((u) => ({
                          id: u.id,
                          name: u.name,
                          mobile: u.mobile,
                        }))}
                        value={field.value ?? []}
                        onChange={field.onChange}
                        disabled={writeBranchId == null}
                        placeholder={
                          writeBranchId == null
                            ? "Select a branch in the header first"
                            : assignableUsersError
                              ? "Could not load staff (check orders permission)"
                              : assignableUsers.length === 0
                                ? "No staff available for this branch"
                                : "Select staff…"
                        }
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {isEdit ? (
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem className="max-w-md">
                      <FormLabel>Order status</FormLabel>
                      <Select
                        value={field.value === "delivered" ? "complete" : field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ORDER_STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
            </div>


            <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-5 shadow-sm md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold tracking-tight">Line items</h2>
                  <p className="text-xs text-muted-foreground">Products, variants, quantity and pricing.</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => append({ ...defaultCatalogLineItem })}>
                  <Plus className="h-4 w-4 mr-0.5" /> Add item
                </Button>
              </div>
              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-3 rounded-xl border border-border/60 bg-muted/10 p-4 shadow-sm">
                  <div className="flex-1">
                    <LineItemRow
                      index={index}
                      form={form}
                      products={productsData?.data ?? []}
                      onlyForLabel="order"
                      isGstInvoice={isGstInvoice}
                      defaultGstPercent={defaultGstPercent}
                    />
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="mt-1" disabled={fields.length === 1}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
                <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => append({ ...defaultCatalogLineItem })}>
                  <Plus className="h-4 w-4 mr-0.5" /> Add item
                </Button>
            </div>


            <FormSection
              title="Delivery"
              description="Delivery charge, driver, date, and staff who can update delivery status."
            >
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
                <FormField control={form.control} name="deliveryCharge" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delivery charge (₹)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={field.value ?? 0}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Added to order total (before payments).</p>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="driverId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Driver</FormLabel>
                    <Select
                      key={`driver-${field.value ?? "none"}`}
                      value={field.value != null && field.value > 0 ? String(field.value) : "none"}
                      onValueChange={(v) => field.onChange(v === "none" ? null : parseInt(v, 10))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select driver" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No driver assigned</SelectItem>
                        {driverOptions.map((d) => (
                          <SelectItem key={d.id} value={String(d.id)}>
                            {d.name}
                            {d.mobile ? ` · ${d.mobile}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="deliveryDate" render={({ field }) => (
                  <FormItem><FormLabel>Date of delivery</FormLabel><FormControl><Input type="date" value={field.value || ""} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField
                  control={form.control}
                  name="deliveryAssigneeUserIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery assignees</FormLabel>
                      <AssigneesMultiSelect
                        options={assignableUsers.map((u) => ({
                          id: u.id,
                          name: u.name,
                          mobile: u.mobile,
                        }))}
                        value={field.value ?? []}
                        onChange={field.onChange}
                        disabled={writeBranchId == null}
                        placeholder={
                          writeBranchId == null
                            ? "Select a branch in the header first"
                            : assignableUsers.length === 0
                              ? "No staff available for this branch"
                              : "Select delivery staff…"
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Only these users and Super Admin can change delivery status for this order.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {deliveryDateWatch ? (
                <div className="flex items-start gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                  <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                  <p className="font-medium">{formatDeliveryDateLabel(deliveryDateWatch)}</p>
                </div>
              ) : null}
              {/* Delivery time slots — disabled (DELIVERY_SLOTS_ENABLED). Re-enable slot picker when scheduling goes live.
              <FormField control={form.control} name="deliverySlotId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Delivery slot</FormLabel>
                  ...
                </FormItem>
              )} />
              */}
            </FormSection>

            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm md:p-6 space-y-4">
              <div>
                <h2 className="text-base font-semibold tracking-tight">Comments &amp; notes</h2>
                <p className="text-xs text-muted-foreground">Internal staff notes and delivery instructions.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="space-y-2">
                  <div>
                    <h3 className="text-sm font-medium">Staff comments</h3>
                    <p className="text-xs text-muted-foreground">One comment per line is saved separately.</p>
                  </div>
                  <FormField
                    control={form.control}
                    name="staffCommentsText"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea
                            rows={5}
                            className="min-h-[7.5rem] resize-y"
                            placeholder="Enter staff comments (one comment per line)"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <div>
                    <h3 className="text-sm font-medium">Delivery comments / notes</h3>
                    <p className="text-xs text-muted-foreground">
                      Instructions for drivers (one note per line).
                    </p>
                  </div>
                  <FormField
                    control={form.control}
                    name="deliveryCommentsText"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea
                            rows={5}
                            className="min-h-[7.5rem] resize-y"
                            placeholder="e.g. Call before arrival, lift not working…"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            </div>
            
            <aside className="order-2 space-y-6 lg:order-2 lg:col-span-4 lg:sticky lg:top-6 lg:self-start">
              <FormSection title="Payment summary" description="Totals from line items">
                <div className="space-y-3">
                  {isGstInvoice ? (
                    <>
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">Sub Total</span>
                        <span className="tabular-nums">{formatInr(orderSummary.taxableSubtotal)}</span>
                      </div>
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">GST</span>
                        <span className="tabular-nums">{formatInr(orderSummary.taxAmount)}</span>
                      </div>
                      <Separator />
                    </>
                  ) : null}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                      Total{isGstInvoice ? " (incl. GST)" : ""}
                    </span>
                    <span className="text-xl font-bold tabular-nums">{formatInr(orderSummary.total)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">{isEdit ? "Paid" : "Advance"}</span>
                    <span className="font-medium text-green-700 tabular-nums">
                      {formatInr(paidAmountDisplay)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Due Amount</span>
                    <span className="font-semibold tabular-nums">{formatInr(balanceAmountDisplay)}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Payment status</span>
                    <span className="font-medium">
                      {formatPaymentStatusLabel(watchedPaymentStatus ?? "due")}
                    </span>
                  </div>
                </div>
              </FormSection>

              <FormSection title="Payment" description={isEdit ? "Payment mode and advance on save" : "Initial payment details"}>
                <div className="space-y-4">
                  <FormField control={form.control} name="paymentStatus" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PAYMENT_STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="paymentMode" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mode of payment</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PAYMENT_MODE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    <FormField control={form.control} name="advanceAmount" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{isEdit ? "Advance amount (₹)" : "Advance amount (₹)"}</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="0.01" className="rounded-xl" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">Remaining</label>
                      <Input
                        className="rounded-xl"
                        value={orderSummary.remaining.toFixed(2)}
                        disabled
                      />
                    </div>
                  </div>
                </div>
              </FormSection>

              <div className="space-y-5 rounded-2xl border border-border/60 bg-card p-5 shadow-sm md:p-6">
                <div>
                  <h2 className="text-base font-semibold tracking-tight">Challan &amp; photos</h2>
                  <p className="text-xs text-muted-foreground">Signed challan is required. Site photos are optional.</p>
                </div>

                <FormField
                  control={form.control}
                  name="challanImages.0.imageUrl"
                  render={({ field, fieldState }) => (
                    <FormItem className="space-y-3">
                      <input
                        id="challan-upload-input"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          void handleUploadToFieldArray(file, (url) => {
                            field.onChange(url);
                            form.clearErrors("challanImages.0.imageUrl");
                          });
                          e.target.value = "";
                        }}
                        disabled={uploading}
                      />
                      <div className="relative overflow-hidden rounded-xl border-2 border-dashed bg-muted/25 transition-colors hover:bg-muted/35">
                        <label
                          htmlFor="challan-upload-input"
                          className={cn(
                            "relative flex aspect-[4/3] max-h-[220px] w-full cursor-pointer items-center justify-center overflow-hidden rounded-[calc(0.75rem-2px)]",
                            field.value ? "border-transparent p-0" : "border-transparent p-6",
                            fieldState.error && "ring-2 ring-destructive/40",
                          )}
                          aria-invalid={fieldState.invalid}
                        >
                          {field.value ? (
                            <img src={field.value} alt="Challan" className="h-full w-full object-contain" />
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-center">
                              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                <ImageIcon className="h-6 w-6" />
                              </span>
                              <span className="text-sm font-medium text-foreground">Add challan</span>
                              <span className="text-xs text-muted-foreground">Camera or gallery</span>
                            </div>
                          )}
                          {field.value ? (
                            <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                              Challan
                            </span>
                          ) : null}
                        </label>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="rounded-xl"
                          disabled={uploading}
                          onClick={() => document.getElementById("challan-upload-input")?.click()}
                        >
                          <Upload className="mr-1.5 h-3.5 w-3.5" />
                          {field.value ? "Replace" : "Upload"}
                        </Button>
                        {field.value ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-xl text-destructive hover:text-destructive"
                            onClick={() => {
                              field.onChange("");
                              const el = document.getElementById("challan-upload-input") as HTMLInputElement | null;
                              if (el) el.value = "";
                            }}
                          >
                            <X className="mr-1.5 h-3.5 w-3.5" />
                            Remove
                          </Button>
                        ) : null}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="border-t border-border/60 pt-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold tracking-tight">Site photos</h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={() => photoFields.append({ imageUrl: "", comment: "" })}
                    >
                      <Plus className="mr-1 h-4 w-4" /> Add
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                    {photoFields.fields.map((field, index) => {
                      const photoUrl = form.watch(`photoComments.${index}.imageUrl`);
                      return (
                        <div
                          key={field.id}
                          className="group flex flex-col gap-1.5 rounded-xl border border-border/60 bg-muted/15 p-2 shadow-sm"
                        >
                          <input
                            id={`photo-upload-${index}`}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              void handleUploadToFieldArray(file, (url) => {
                                form.setValue(`photoComments.${index}.imageUrl`, url);
                              });
                              e.target.value = "";
                            }}
                            disabled={uploading}
                          />
                          <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-background">
                            <label
                              htmlFor={`photo-upload-${index}`}
                              className={cn(
                                "absolute inset-0 flex cursor-pointer items-center justify-center",
                                photoUrl ? "p-0" : "p-2",
                              )}
                            >
                              {photoUrl ? (
                                <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <Upload className="h-5 w-5 text-muted-foreground" />
                              )}
                            </label>
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon"
                              className="absolute -right-0.5 top-0.5 h-7 w-7 rounded-sm opacity-90 shadow-sm"
                              onClick={() => photoFields.remove(index)}
                              disabled={photoFields.fields.length === 1}
                              aria-label="Remove photo"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                          <FormField
                            control={form.control}
                            name={`photoComments.${index}.comment`}
                            render={({ field: commentField }) => (
                              <FormItem className="space-y-0">
                                <FormControl>
                                  <Textarea
                                    rows={2}
                                    className="resize-y text-xs leading-snug"
                                    placeholder="Caption"
                                    {...commentField}
                                    value={commentField.value || ""}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          {photoUrl ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[11px] text-muted-foreground"
                              disabled={uploading}
                              onClick={() => document.getElementById(`photo-upload-${index}`)?.click()}
                            >
                              Replace image
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => photoFields.append({ imageUrl: "", comment: "" })}
                      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border/80 bg-muted/10 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/25"
                    >
                      <Plus className="h-6 w-6" />
                      <span className="text-[10px] font-medium">Add photo</span>
                    </button>
                  </div>
                </div>
              </div>

            </aside>

          </div>

          <div className="flex justify-end gap-3">
            <Link href="/orders" className="w-fit">
              <Button type="button" variant="outline" className="w-fit rounded-xl px-6 sm:w-auto">
                Cancel
              </Button>
            </Link>
            <Button type="submit" className="w-full rounded-xl px-8 shadow-sm sm:w-auto" disabled={pending || uploading}>
              {uploading ? (
                <>
                  <Upload className="mr-2 h-4 w-4 animate-pulse" /> Uploading…
                </>
              ) : isEdit ? (
                "Save changes"
              ) : (
                "Create order"
              )}
            </Button>
          </div>
        </form>
      </Form>

    </div>
  );
}

export function OrderCreatePage() {
  return <OrderFormPage mode="create" />;
}

export function OrderEditPage() {
  return <OrderFormPage mode="edit" />;
}

