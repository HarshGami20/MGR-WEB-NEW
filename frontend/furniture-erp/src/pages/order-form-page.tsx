import { useEffect, useMemo, useState } from "react";
import { Link, Redirect, useLocation, useRoute } from "wouter";
import {
  useCreateOrder,
  useGetOrder,
  useListUsers,
  useListProducts,
  useUpdateOrder,
  getGetOrderQueryKey,
  getListOrdersQueryKey,
} from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Upload } from "lucide-react";
import { z } from "zod";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import ProductVariantSelect from "@/components/product-variant-select";

const orderItemSchema = z.object({
  productId: z.coerce.number().min(1, "Product is required"),
  variantId: z.coerce.number().optional().nullable(),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  unitPrice: z.coerce.number().min(0, "Price must be positive").default(0),
});

const orderSchema = z.object({
  customerName: z.string().min(1, "Customer name is required"),
  customerMobile: z.string().optional().nullable(),
  customerAddress: z.string().optional().nullable(),
  isGst: z.boolean(),
  customerGstNumber: z.string().optional().nullable(),
  items: z.array(orderItemSchema).min(1, "At least one item is required"),
  status: z.string().default("order_received"),
  paymentStatus: z.string().default("due"),
  advanceAmount: z.coerce.number().min(0).default(0),
  paymentMode: z.string().default("cash"),
  assignedToId: z.coerce.number().nullable().optional(),
  deliveryDate: z.string().nullable().optional(),
  challanImages: z.array(z.object({ imageUrl: z.string().min(1) })).default([]),
  photoComments: z.array(z.object({
    imageUrl: z.string().optional().default(""),
    comment: z.string().optional().default(""),
  })).default([]),
  staffCommentsText: z.string().optional().default(""),
  notes: z.string().optional().nullable(),
});

type OrderFormValues = z.infer<typeof orderSchema>;

const ORDER_STATUS_OPTIONS = [
  { value: "order_received", label: "Order Received" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "ready_to_ship", label: "Ready To Ship" },
  { value: "delivered", label: "Delivered" },
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

async function uploadOrderImage(file: File): Promise<string> {
  const token = localStorage.getItem("erp_token");
  const fd = new FormData();
  fd.append("image", file);
  const resp = await fetch("/api/orders/upload-image", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: fd,
  });
  if (!resp.ok) throw new Error("Failed to upload image");
  const data = await resp.json();
  return data.imageUrl as string;
}

function OrderFormPage({ mode }: { mode: "create" | "edit" }) {
  const [, params] = useRoute("/orders/:id/edit");
  const orderId = params?.id ? parseInt(params.id, 10) : NaN;
  const isEdit = mode === "edit";
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: productsData } = useListProducts({ limit: 1000 });
  const { data: usersData } = useListUsers({ isActive: true, limit: 1000 });
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
    defaultValues: {
      customerName: "",
      customerMobile: "",
      customerAddress: "",
      isGst: false,
      customerGstNumber: "",
      items: [{ productId: 0, variantId: null, quantity: 1, unitPrice: 0 }],
      status: "order_received",
      paymentStatus: "due",
      advanceAmount: 0,
      paymentMode: "cash",
      assignedToId: null,
      deliveryDate: null,
      challanImages: [{ imageUrl: "" }],
      photoComments: [{ imageUrl: "", comment: "" }],
      staffCommentsText: "",
      notes: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });
  const challanFields = useFieldArray({ control: form.control, name: "challanImages" });
  const photoFields = useFieldArray({ control: form.control, name: "photoComments" });

  useEffect(() => {
    if (!isEdit || !order) return;
    const orderAny = order as any;
    const existingStaffComments = Array.isArray(orderAny.staffComments) ? orderAny.staffComments : [];
    form.reset({
      customerName: order.customerName ?? "",
      customerMobile: order.customerMobile ?? "",
      customerAddress: order.customerAddress ?? "",
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
      status: orderAny.status ?? "order_received",
      paymentStatus: orderAny.paymentStatus ?? "due",
      advanceAmount: orderAny.advanceAmount ?? orderAny.paidAmount ?? 0,
      paymentMode: orderAny.paymentMode ?? "cash",
      assignedToId: orderAny.assignedToId ?? null,
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
      notes: order.notes ?? "",
    });
  }, [isEdit, order, form]);

  const orderSummary = useMemo(() => {
    const items = form.watch("items");
    const subtotal = items.reduce((acc, item) => acc + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
    const advance = Number(form.watch("advanceAmount") || 0);
    return { subtotal, remaining: Math.max(0, subtotal - advance) };
  }, [form.watch("items"), form.watch("advanceAmount")]);

  const handleUploadToFieldArray = async (
    file: File | undefined,
    apply: (imageUrl: string) => void,
  ) => {
    if (!file) return;
    try {
      setUploading(true);
      const imageUrl = await uploadOrderImage(file);
      apply(imageUrl);
      toast({ title: "Image uploaded" });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error?.message ?? "Please try again", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = (data: OrderFormValues) => {
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
      assignedToId: data.assignedToId ? Number(data.assignedToId) : null,
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
      notes: data.notes || null,
    };

    if (isEdit) {
      updateOrder.mutate({ id: orderId, data: payload as any });
      return;
    }
    createOrder.mutate({ data: payload as any });
  };

  if (isEdit && (!Number.isFinite(orderId) || orderId <= 0)) return <Redirect to="/orders" />;
  if (isEdit && orderLoading) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading order…</div>;
  if (isEdit && orderError) return <div className="text-muted-foreground">Order not found.</div>;

  const pending = createOrder.isPending || updateOrder.isPending;

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-[hsl(0_0%_97%)] -mx-4 -mt-4 px-4 py-8 md:-mx-8 md:px-8 md:py-10">
      <div className="max-w-3xl">
        <Link href="/orders">
          <Button type="button" variant="ghost" className="mb-6 -ml-2 gap-2 text-foreground hover:bg-transparent hover:text-foreground/80">
            <ArrowLeft className="h-4 w-4" />
            Back to orders
          </Button>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{isEdit ? "Edit order" : "Create order"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Enter full order details, payments and delivery controls.</p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-6">
            <div className="rounded-xl border border-border/60 bg-white p-5 space-y-4">
              <p className="text-sm font-semibold text-foreground">Order details</p>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="customerName" render={({ field }) => (
                  <FormItem><FormLabel>Customer Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="customerMobile" render={({ field }) => (
                  <FormItem><FormLabel>Mobile</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="isGst" render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm h-[68px]">
                    <div className="space-y-0.5"><FormLabel>GST Invoice</FormLabel></div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="customerGstNumber" render={({ field }) => (
                  <FormItem><FormLabel>GST Number</FormLabel><FormControl><Input {...field} value={field.value || ""} disabled={!form.watch("isGst")} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <FormField control={form.control} name="customerAddress" render={({ field }) => (
                <FormItem><FormLabel>Address</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
              )} />
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{ORDER_STATUS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="paymentStatus" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{PAYMENT_STATUS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="paymentMode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mode of Payment</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{PAYMENT_MODE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="advanceAmount" render={({ field }) => (
                  <FormItem><FormLabel>Advance Amount (Rs)</FormLabel><FormControl><Input type="number" min="0" step="0.01" {...field} /></FormControl></FormItem>
                )} />
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Remaining Amount</label>
                  <Input value={orderSummary.remaining.toFixed(2)} disabled />
                </div>
                <FormField control={form.control} name="deliveryDate" render={({ field }) => (
                  <FormItem><FormLabel>Date of Delivery</FormLabel><FormControl><Input type="date" value={field.value || ""} onChange={field.onChange} /></FormControl></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="assignedToId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assign To</FormLabel>
                    <Select value={field.value ? String(field.value) : "unassigned"} onValueChange={(v) => field.onChange(v === "unassigned" ? null : Number(v))}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {(usersData?.data ?? []).map((u) => (
                          <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Computed Subtotal</label>
                  <Input value={orderSummary.subtotal.toFixed(2)} disabled />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-white p-5 space-y-5">
              <p className="text-sm font-semibold">Challan image + Upload photos and comment</p>

              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Challan image</p>
                <input
                  id="challan-upload-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleUploadToFieldArray(e.target.files?.[0], (url) => form.setValue("challanImages.0.imageUrl", url))}
                  disabled={uploading}
                />
                <label
                  htmlFor="challan-upload-input"
                  className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-border p-4 hover:bg-muted/30"
                >
                  {form.watch("challanImages.0.imageUrl") ? (
                    <img
                      src={form.watch("challanImages.0.imageUrl") || ""}
                      alt="Challan preview"
                      className="h-28 w-28 rounded-md border object-cover"
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">Tap to upload challan</span>
                  )}
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Photo comments</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => photoFields.append({ imageUrl: "", comment: "" })}>
                    <Plus className="h-4 w-4 mr-2" /> Add
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {photoFields.fields.map((field, index) => (
                    <div key={field.id} className="rounded-md border p-3 space-y-3">
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-muted-foreground">Photo {index + 1}</p>
                        <Button type="button" variant="ghost" size="icon" onClick={() => photoFields.remove(index)} disabled={photoFields.fields.length === 1}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <input
                        id={`photo-upload-${index}`}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handleUploadToFieldArray(e.target.files?.[0], (url) => form.setValue(`photoComments.${index}.imageUrl`, url))}
                        disabled={uploading}
                      />
                      <label
                        htmlFor={`photo-upload-${index}`}
                        className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-border p-3 hover:bg-muted/30"
                      >
                        {form.watch(`photoComments.${index}.imageUrl`) ? (
                          <img
                            src={form.watch(`photoComments.${index}.imageUrl`) || ""}
                            alt={`Photo preview ${index + 1}`}
                            className="h-24 w-24 rounded-md border object-cover"
                          />
                        ) : (
                          <span className="text-sm text-muted-foreground">Tap to upload photo</span>
                        )}
                      </label>
                      <FormField control={form.control} name={`photoComments.${index}.comment`} render={({ field }) => (
                        <FormItem><FormControl><Textarea rows={3} placeholder="Enter your comment" {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-white p-5 space-y-4">
              <FormField control={form.control} name="staffCommentsText" render={({ field }) => (
                <FormItem>
                  <FormLabel>Comments By Staff</FormLabel>
                  <FormControl><Textarea rows={4} placeholder="Enter staff comments (one comment per line)" {...field} value={field.value || ""} /></FormControl>
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea rows={3} {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
            )} />

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

