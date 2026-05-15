import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, Redirect, useLocation, useRoute } from "wouter";
import {
  useCreateOrder,
  useGetOrder,
  useListAssignableOrderUsers,
  useListProducts,
  useUpdateOrder,
  getGetOrderQueryKey,
  getListOrdersQueryKey,
} from "@/api-client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ImageIcon, Plus, Trash2, Upload, X } from "lucide-react";
import { z } from "zod";
import { useFieldArray, useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AssigneesMultiSelect } from "@/components/assignees-multi-select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useBranch, assignedUserBranchIds } from "@/lib/branch-context";
import ProductVariantSelect from "@/components/product-variant-select";
import { GoogleAddressInput } from "@/components/google-address-input";
import { fetchAvailableDeliverySlots, type AvailableDeliverySlot } from "@/lib/delivery-api";

const EMPTY_AVAIL_SLOTS: AvailableDeliverySlot[] = [];

const orderItemSchema = z.object({
  productId: z.coerce.number().min(1, "Product is required"),
  variantId: z.coerce.number().optional().nullable(),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  unitPrice: z.coerce.number().min(0, "Price must be positive").default(0),
});

const orderSchema = z.object({
  customerName: z.string().trim().min(1, "Customer name is required"),
  customerMobile: z
    .string()
    .trim()
    .refine((value) => value === "" || /^[0-9]{10}$/.test(value), "Mobile must be a 10-digit number")
    .optional()
    .nullable(),
  customerAddress: z.string().trim().min(1, "Address is required"),
  customerPincode: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[0-9]{6}$/.test(v), "Pincode must be 6 digits")
    .optional()
    .nullable(),
  deliverySlotId: z
    .union([z.number().int().positive(), z.null()])
    .optional()
    .nullable(),
  googlePlaceId: z.string().optional().nullable(),
  addressLat: z.coerce.number().nullable().optional(),
  addressLng: z.coerce.number().nullable().optional(),
  isGst: z.boolean(),
  customerGstNumber: z
    .string()
    .trim()
    .refine((value) => value === "" || /^[0-9A-Z]{15}$/.test(value), "GST number must be 15 characters")
    .optional()
    .nullable(),
  items: z.array(orderItemSchema).min(1, "At least one item is required"),
  status: z.string().default("order_received"),
  paymentStatus: z.string().default("due"),
  advanceAmount: z.coerce.number().min(0).default(0),
  paymentMode: z.string().default("cash"),
  assigneeUserIds: z.array(z.number().int().positive()).optional().default([]),
  deliveryDate: z.string().nullable().optional(),
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
}).superRefine((data, ctx) => {
  if (data.isGst && !data.customerGstNumber?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customerGstNumber"],
      message: "GST number is required when GST invoice is enabled",
    });
  }
  if (Number(data.advanceAmount || 0) > data.items.reduce((acc, item) => acc + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["advanceAmount"],
      message: "Advance amount cannot exceed subtotal",
    });
  }
});

type OrderFormValues = z.infer<typeof orderSchema>;

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

async function uploadOrderImage(file: File, branchId: number | null | undefined): Promise<string> {
  const token = localStorage.getItem("erp_token");
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
  const { data: assignableUsersData, isError: assignableUsersError } = useListAssignableOrderUsers(
    writeBranchId != null ? { branchId: writeBranchId, limit: 1000 } : undefined,
    { query: { enabled: writeBranchId != null } },
  );
  const { data: order, isLoading: orderLoading, isError: orderError } = useGetOrder(orderId, {
    query: { enabled: isEdit && Number.isFinite(orderId) && orderId > 0 },
  });

  const [uploading, setUploading] = useState(false);

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
    defaultValues: {
      customerName: "",
      customerMobile: "",
      customerAddress: "",
      customerPincode: "",
      deliverySlotId: null as number | null,
      googlePlaceId: "",
      addressLat: null as number | null,
      addressLng: null as number | null,
      isGst: false,
      customerGstNumber: "",
      items: [{ productId: 0, variantId: null, quantity: 1, unitPrice: 0 }],
      status: "order_received",
      paymentStatus: "due",
      advanceAmount: 0,
      paymentMode: "cash",
      assigneeUserIds: [] as number[],
      deliveryDate: null,
      challanImages: [{ imageUrl: "" }],
      photoComments: [{ imageUrl: "", comment: "" }],
      staffCommentsText: "",
    },
  });

  const deliveryDateWatch = form.watch("deliveryDate");
  const pincodeWatch = form.watch("customerPincode");

  const { data: slotOptionsRaw } = useQuery({
    queryKey: ["availableSlots", writeBranchId, deliveryDateWatch, pincodeWatch, isEdit ? orderId : 0],
    queryFn: () =>
      fetchAvailableDeliverySlots({
        branchId: writeBranchId!,
        date: String(deliveryDateWatch).slice(0, 10),
        pincode: (pincodeWatch || "").trim() || undefined,
        excludeOrderId: isEdit && Number.isFinite(orderId) ? orderId : undefined,
      }),
    enabled:
      writeBranchId != null &&
      !!deliveryDateWatch &&
      String(deliveryDateWatch).trim().length >= 8,
  });
  const slotOptions = slotOptionsRaw ?? EMPTY_AVAIL_SLOTS;

  useEffect(() => {
    if (!deliveryDateWatch || !slotOptions.length) return;
    const free = slotOptions.filter((s) => s.remaining > 0);
    if (!free.length) return;
    const cur = form.getValues("deliverySlotId");
    if (cur != null && free.some((s) => s.id === cur)) return;
    if (cur != null && !free.some((s) => s.id === cur)) {
      form.setValue("deliverySlotId", free[0]!.id);
      return;
    }
    if (cur == null) form.setValue("deliverySlotId", free[0]!.id);
  }, [deliveryDateWatch, pincodeWatch, slotOptions, form]);

  const onGoogleResolved = useCallback(
    (sel: import("@/components/google-address-input").GoogleAddressSelection) => {
      if (sel.pincode) form.setValue("customerPincode", sel.pincode);
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

  useEffect(() => {
    if (!isEdit || !order) return;
    const orderAny = order as any;
    const existingStaffComments = Array.isArray(orderAny.staffComments) ? orderAny.staffComments : [];
    form.reset({
      customerName: order.customerName ?? "",
      customerMobile: order.customerMobile ?? "",
      customerAddress: order.customerAddress ?? "",
      customerPincode: orderAny.customerPincode ?? "",
      deliverySlotId: orderAny.deliverySlotId ?? null,
      googlePlaceId: orderAny.googlePlaceId ?? "",
      addressLat: orderAny.addressLat != null ? Number(orderAny.addressLat) : null,
      addressLng: orderAny.addressLng != null ? Number(orderAny.addressLng) : null,
      isGst: !!order.isGst,
      customerGstNumber: order.customerGstNumber ?? "",
      items: order.items?.length
        ? order.items.map((item: any) => ({
            productId: item.productId ?? item.product?.id ?? 0,
            variantId: item.variantId ?? null,
            quantity: item.quantity ?? 1,
            unitPrice: item.unitPrice ?? item.product?.price ?? 0,
          }))
        : [{ productId: 0, variantId: null, quantity: 1, unitPrice: 0 }],
      status: orderAny.status === "delivered" ? "complete" : (orderAny.status ?? "order_received"),
      paymentStatus: orderAny.paymentStatus ?? "due",
      advanceAmount: orderAny.advanceAmount ?? orderAny.paidAmount ?? 0,
      paymentMode: orderAny.paymentMode ?? "cash",
      assigneeUserIds: Array.isArray(orderAny.assignees)
        ? orderAny.assignees.map((a: { id: number }) => a.id).filter((x: number) => Number.isFinite(x))
        : orderAny.assignedToId != null
          ? [Number(orderAny.assignedToId)]
          : [],
      deliveryDate: orderAny.deliveryDate ? String(orderAny.deliveryDate).slice(0, 10) : null,
      challanImages: Array.isArray(orderAny.challanImages) && orderAny.challanImages.length > 0
        ? [{ imageUrl: String(orderAny.challanImages[0] || "") }]
        : [{ imageUrl: "" }],
      photoComments: Array.isArray(orderAny.photoComments) && orderAny.photoComments.length > 0
        ? orderAny.photoComments
        : [{ imageUrl: "", comment: "" }],
      staffCommentsText: existingStaffComments
        .map((entry: any) => entry?.comment)
        .filter(Boolean)
        .join("\n"),
    });
  }, [isEdit, order, form]);

  const watchedItems = form.watch("items");
  const watchedAdvance = form.watch("advanceAmount");
  const orderSummary = useMemo(() => {
    const subtotal = watchedItems.reduce(
      (acc, item) => acc + Number(item.quantity || 0) * Number(item.unitPrice || 0),
      0,
    );
    const advance = Number(watchedAdvance || 0);
    return { subtotal, remaining: Math.max(0, subtotal - advance) };
  }, [watchedItems, watchedAdvance]);

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
      const product = productsData?.data?.find((p) => p.id === Number(item.productId));
      if (product?.variantCount && product.variantCount > 0 && !item.variantId) {
        form.setError(`items.${i}.productId`, { message: "Please select a variant for this product" });
        return;
      }
    }

    const payload = {
      customerName: data.customerName,
      customerMobile: data.customerMobile || null,
      customerAddress: data.customerAddress || null,
      customerPincode: data.customerPincode?.trim() || null,
      deliverySlotId: data.deliverySlotId ?? null,
      googlePlaceId: data.googlePlaceId?.trim() || null,
      addressLat: data.addressLat ?? null,
      addressLng: data.addressLng ?? null,
      isGst: !!data.isGst,
      customerGstNumber: data.customerGstNumber || null,
      items: data.items.map((item) => ({
        productId: Number(item.productId),
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      })),
      status: data.status,
      paymentStatus: data.paymentStatus,
      advanceAmount: Number(data.advanceAmount ?? 0),
      paymentMode: data.paymentMode || "cash",
      assigneeUserIds: (data.assigneeUserIds ?? []).filter((id) => Number.isFinite(id) && id > 0),
      deliveryDate: data.deliveryDate || null,
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

  if (isEdit && (!Number.isFinite(orderId) || orderId <= 0)) return <Redirect to="/orders" />;
  if (isEdit && orderLoading) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading order…</div>;
  if (isEdit && orderError) return <div className="text-muted-foreground">Order not found.</div>;

  const pending = createOrder.isPending || updateOrder.isPending;

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-[hsl(0_0%_97%)] -mx-4 -mt-4 px-4 py-8 md:-mx-8 md:px-8 md:py-10">
      <div className="max-w-3xl">
        <div className="flex  ">
          <Link href="/orders">
            <Button type="button" variant="ghost" size="icon" className="mr-2 -top-0.5 rounded-full text-foreground hover:bg-transparent hover:text-foreground/80">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>  
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{isEdit ? "Edit order" : "Create order"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Enter full order details, payments and delivery controls.</p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onSubmitInvalid)} className="mt-8 space-y-6">
            <div className="rounded-xl border border-border/60 bg-white p-5 space-y-4">
              <p className="text-sm font-semibold text-foreground">Order details</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="customerName" render={({ field }) => (
                  <FormItem><FormLabel>Customer Name*</FormLabel><FormControl><Input {...field} placeholder="Enter customer name" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="customerMobile"  render={({ field }) => (
                  <FormItem><FormLabel>Mobile*</FormLabel><FormControl><Input {...field} value={field.value || ""} type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={10} placeholder="+91 98765 43210" onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ""))} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <div className="sm:flex grid items-center justify-center gap-4">
                <FormField control={form.control} name="isGst" render={({ field }) => (
                  <FormItem className="flex h-full items-center justify-between gap-3 space-y-0 ">
                    <FormLabel className=" font-normal">GST Invoice</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control}  name="customerGstNumber" render={({ field }) => (
                  <FormItem className="flex-1"><FormLabel>GST Number</FormLabel><FormControl><Input {...field} value={field.value || ""} placeholder="Enter GST number" disabled={!form.watch("isGst")} /></FormControl><FormMessage /></FormItem>
                )} />
                   <FormField control={form.control} name="customerPincode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pincode</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value || ""}
                        placeholder="6-digit pincode"
                        maxLength={6}
                        inputMode="numeric"
                        onChange={(e) => field.onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="customerAddress" render={({ field }) => (
                <FormItem>
                  <FormLabel>Address*</FormLabel>
                  <FormControl>
                    <GoogleAddressInput
                      value={field.value || ""}
                      onChangeAddress={field.onChange}
                      onResolved={onGoogleResolved}
                      placeholder="Search or type full address"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             
              </div>
            </div>


            <div className="space-y-4 rounded-xl border border-border/60 bg-white p-5">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Product details</h4>
                <Button type="button" variant="outline" size="sm" onClick={() => append({ productId: 0, variantId: null, quantity: 1, unitPrice: 0 })}>
                  <Plus className="h-4 w-4 mr-2" /> Add Item
                </Button>
              </div>
              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-start border p-3 rounded-md">
                  <div className="flex-1 space-y-4">
                    <ProductVariantSelect
                      products={productsData?.data ?? []}
                      productId={Number(form.watch(`items.${index}.productId`) ?? 0)}
                      variantId={form.watch(`items.${index}.variantId`) ?? null}
                      onProductChange={(productId) => {
                        form.setValue(`items.${index}.productId`, productId);
                        form.setValue(`items.${index}.variantId`, null);
                      }}
                      onVariantChange={(variantId) => form.setValue(`items.${index}.variantId`, variantId)}
                      onPriceChange={(price) => form.setValue(`items.${index}.unitPrice`, Number(price || 0))}
                    />
                    {(form.formState.errors.items?.[index]?.productId?.message ||
                      form.formState.errors.items?.[index]?.variantId?.message) && (
                      <p className="text-sm font-medium text-destructive">
                        {form.formState.errors.items?.[index]?.productId?.message ||
                          form.formState.errors.items?.[index]?.variantId?.message}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name={`items.${index}.quantity`} render={({ field: qtyField }) => (
                        <FormItem><FormLabel className="text-xs">Quantity</FormLabel><FormControl><Input type="number" min="1" {...qtyField} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field: priceField }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Price (auto)</FormLabel>
                          <FormControl><Input type="number" min="0" step="0.01" {...priceField} disabled /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="mt-1" disabled={fields.length === 1}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>


            <div className="rounded-xl border border-border/60 bg-white p-5 space-y-4">
              <p className="text-sm font-semibold text-foreground">Status & payment details</p>
              <div className={cn("grid grid-cols-1 gap-4", isEdit ? "md:grid-cols-3" : "md:grid-cols-2")}>
                {isEdit && (
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order Status</FormLabel>
                    <Select value={field.value === "delivered" ? "complete" : field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{ORDER_STATUS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormItem>
                )} />
                )}
                <FormField control={form.control} name="paymentStatus" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{PAYMENT_STATUS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="paymentMode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mode of Payment</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{PAYMENT_MODE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <FormField control={form.control} name="advanceAmount" render={({ field }) => (
                  <FormItem><FormLabel>Advance Amount (Rs)</FormLabel><FormControl><Input type="number" min="0" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Remaining Amount</label>
                  <Input value={orderSummary.remaining.toFixed(2)} disabled />
                </div>
                <FormField control={form.control} name="deliveryDate" render={({ field }) => (
                  <FormItem><FormLabel>Date of Delivery</FormLabel><FormControl><Input type="date" value={field.value || ""} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="deliverySlotId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delivery slot</FormLabel>
                    <Select
                      value={field.value != null ? String(field.value) : undefined}
                      onValueChange={(v) => field.onChange(Number(v))}
                      disabled={!deliveryDateWatch || !slotOptions.some((s) => s.remaining > 0)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={slotOptions.some((s) => s.remaining > 0) ? "Select slot" : "No capacity"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {slotOptions
                          .filter((s) => s.remaining > 0)
                          .map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>
                              {s.label} ({s.startTime}–{s.endTime}) · {s.remaining} left
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="assigneeUserIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assign to (team)</FormLabel>
                      <p className="text-xs text-muted-foreground mb-2">
                        Search and select one or more staff. Notifications go to all assignees.
                      </p>
                      <AssigneesMultiSelect
                        options={(assignableUsersData?.data ?? []).map((u) => ({
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
                              : (assignableUsersData?.data ?? []).length === 0
                                ? "No staff available for this branch"
                                : "Select staff…"
                        }
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Computed Subtotal</label>
                  <Input value={orderSummary.subtotal.toFixed(2)} disabled />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-white p-5 space-y-6">
              <div>
                <p className="text-sm font-semibold text-foreground">Delivery challan*</p>
                <p className="text-xs text-muted-foreground mt-1">Upload a clear photo of the signed challan. Required before saving.</p>
              </div>

              <FormField
                control={form.control}
                name="challanImages.0.imageUrl"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
                      <div className="relative md:w-[min(100%,280px)] shrink-0">
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
                        <label
                          htmlFor="challan-upload-input"
                          className={cn(
                            "group flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-muted/20 transition-colors hover:bg-muted/40",
                            field.value ? "border-primary/40 p-1" : "border-border p-6",
                            fieldState.error && "border-destructive/70 ring-1 ring-destructive/25",
                          )}
                          aria-invalid={fieldState.invalid}
                        >
                          {field.value ? (
                            <img src={field.value} alt="Challan preview" className="h-full w-full rounded-lg object-contain" />
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-center">
                              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                <ImageIcon className="h-6 w-6" />
                              </span>
                              <span className="text-sm font-medium text-foreground">Add challan photo</span>
                              <span className="text-xs text-muted-foreground">Camera or gallery</span>
                            </div>
                          )}
                        </label>
                        {field.value ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="gap-1.5"
                              disabled={uploading}
                              onClick={() => document.getElementById("challan-upload-input")?.click()}
                            >
                              <Upload className="h-3.5 w-3.5" />
                              Replace
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-destructive hover:text-destructive"
                              onClick={() => {
                                field.onChange("");
                                const inp = document.getElementById("challan-upload-input") as HTMLInputElement | null;
                                if (inp) inp.value = "";
                              }}
                            >
                              <X className="h-3.5 w-3.5" />
                              Remove
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col justify-center rounded-lg border border-border/80 bg-muted/10 p-4">
                        <p className="text-sm text-foreground/90">
                          {field.value
                            ? "Challan is attached. You can replace it or remove it before saving."
                            : "A challan image is required. Tap the frame on the left or use Replace after uploading."}
                        </p>
                        <FormMessage className="mt-3 text-sm" />
                      </div>
                    </div>
                  </FormItem>
                )}
              />

              <div className="border-t border-border/60 pt-6 space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Site photos</p>
                    <p className="text-xs text-muted-foreground">Optional — pair each image with a short caption.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => photoFields.append({ imageUrl: "", comment: "" })}>
                    <Plus className="h-4 w-4 mr-2" /> Add row
                  </Button>
                </div>
                <div className="space-y-4">
                  {photoFields.fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="rounded-xl border border-border/60 bg-muted/5 p-4 shadow-sm"
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Photo {index + 1}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => photoFields.remove(index)}
                          disabled={photoFields.fields.length === 1}
                          aria-label="Remove photo row"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
                        <div className="lg:w-44 shrink-0">
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
                          <label
                            htmlFor={`photo-upload-${index}`}
                            className={cn(
                              "flex aspect-square w-full max-w-[200px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors hover:bg-muted/30 lg:max-w-none",
                              form.watch(`photoComments.${index}.imageUrl`) ? "border-primary/35 p-0.5" : "border-border p-3",
                            )}
                          >
                            {form.watch(`photoComments.${index}.imageUrl`) ? (
                              <img
                                src={form.watch(`photoComments.${index}.imageUrl`) || ""}
                                alt={`Photo ${index + 1}`}
                                className="h-full w-full rounded-md object-cover"
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-1.5 px-1 text-center">
                                <Upload className="h-5 w-5 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Upload</span>
                              </div>
                            )}
                          </label>
                          {form.watch(`photoComments.${index}.imageUrl`) ? (
                            <div className="mt-2 flex gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="h-7 flex-1 text-xs"
                                disabled={uploading}
                                onClick={() => document.getElementById(`photo-upload-${index}`)?.click()}
                              >
                                Replace
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 flex-1 text-xs text-destructive"
                                onClick={() => {
                                  form.setValue(`photoComments.${index}.imageUrl`, "");
                                  const inp = document.getElementById(`photo-upload-${index}`) as HTMLInputElement | null;
                                  if (inp) inp.value = "";
                                }}
                              >
                                Clear
                              </Button>
                            </div>
                          ) : null}
                        </div>
                        <FormField
                          control={form.control}
                          name={`photoComments.${index}.comment`}
                          render={({ field: commentField }) => (
                            <FormItem className="min-w-0 flex-1 flex flex-col">
                              <FormLabel className="text-xs text-muted-foreground">Caption / comment</FormLabel>
                              <FormControl>
                                <Textarea
                                  rows={4}
                                  className="min-h-[7rem] resize-y bg-background lg:min-h-0 lg:flex-1"
                                  placeholder="What should staff know about this photo?"
                                  {...commentField}
                                  value={commentField.value || ""}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <FormField control={form.control} name="staffCommentsText" render={({ field }) => (
                <FormItem>
                  <FormLabel>Comments By Staff</FormLabel>
                  <FormControl><Textarea rows={4} placeholder="Enter staff comments (one comment per line)" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Link href="/orders"><Button type="button" variant="outline">Cancel</Button></Link>
              <Button type="submit" disabled={pending || uploading}>
                {uploading ? <><Upload className="h-4 w-4 mr-2 animate-pulse" /> Uploading...</> : isEdit ? "Update Order" : "Create Order"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}

export function OrderCreatePage() {
  return <OrderFormPage mode="create" />;
}

export function OrderEditPage() {
  return <OrderFormPage mode="edit" />;
}

