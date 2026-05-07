import { useEffect } from "react";
import { Link, Redirect, useLocation, useRoute } from "wouter";
import {
  useCreateOrder,
  useGetOrder,
  useListProducts,
  useUpdateOrder,
  getGetOrderQueryKey,
  getListOrdersQueryKey,
} from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const orderItemSchema = z.object({
  productId: z.coerce.number().min(1, "Product is required"),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  unitPrice: z.coerce.number().min(0, "Price must be positive"),
});

const orderSchema = z.object({
  customerName: z.string().min(1, "Customer name is required"),
  customerMobile: z.string().optional().nullable(),
  customerAddress: z.string().optional().nullable(),
  isGst: z.boolean(),
  customerGstNumber: z.string().optional().nullable(),
  items: z.array(orderItemSchema).min(1, "At least one item is required"),
  notes: z.string().optional().nullable(),
});

type OrderFormValues = z.infer<typeof orderSchema>;

function OrderFormPage({ mode }: { mode: "create" | "edit" }) {
  const [, params] = useRoute("/orders/:id/edit");
  const orderId = params?.id ? parseInt(params.id, 10) : NaN;
  const isEdit = mode === "edit";
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: productsData } = useListProducts({ limit: 1000 });
  const { data: order, isLoading: orderLoading, isError: orderError } = useGetOrder(orderId, {
    query: { enabled: isEdit && Number.isFinite(orderId) && orderId > 0 },
  });

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
      items: [{ productId: 0, quantity: 1, unitPrice: 0 }],
      notes: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  useEffect(() => {
    if (!isEdit || !order) return;
    form.reset({
      customerName: order.customerName ?? "",
      customerMobile: order.customerMobile ?? "",
      customerAddress: order.customerAddress ?? "",
      isGst: !!order.isGst,
      customerGstNumber: order.customerGstNumber ?? "",
      items: order.items?.length
        ? order.items.map((item: any) => ({
            productId: item.productId ?? item.product?.id ?? 0,
            quantity: item.quantity ?? 1,
            unitPrice: item.unitPrice ?? item.product?.price ?? 0,
          }))
        : [{ productId: 0, quantity: 1, unitPrice: 0 }],
      notes: order.notes ?? "",
    });
  }, [isEdit, order, form]);

  const handleProductSelect = (index: number, productIdStr: string) => {
    const productId = parseInt(productIdStr, 10);
    const product = productsData?.data?.find((p) => p.id === productId);
    if (product) {
      form.setValue(`items.${index}.productId`, productId);
      form.setValue(`items.${index}.unitPrice`, product.price);
    }
  };

  const onSubmit = (data: OrderFormValues) => {
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
        <p className="mt-1 text-sm text-muted-foreground">Enter customer details and line items.</p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-6">
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

            <div className="space-y-4 rounded-xl border border-border/60 bg-white p-5">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Order Items</h4>
                <Button type="button" variant="outline" size="sm" onClick={() => append({ productId: 0, quantity: 1, unitPrice: 0 })}>
                  <Plus className="h-4 w-4 mr-2" /> Add Item
                </Button>
              </div>
              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-start border p-3 rounded-md">
                  <div className="flex-1 space-y-4">
                    <FormField
                      control={form.control}
                      name={`items.${index}.productId`}
                      render={({ field: productField }) => (
                        <FormItem>
                          <Select value={productField.value ? productField.value.toString() : ""} onValueChange={(val) => handleProductSelect(index, val)}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select Product" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {productsData?.data?.map((p) => (
                                <SelectItem key={p.id} value={p.id.toString()}>{p.name} - ₹{p.price}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name={`items.${index}.quantity`} render={({ field: qtyField }) => (
                        <FormItem><FormLabel className="text-xs">Quantity</FormLabel><FormControl><Input type="number" min="1" {...qtyField} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field: priceField }) => (
                        <FormItem><FormLabel className="text-xs">Unit Price (₹)</FormLabel><FormControl><Input type="number" min="0" step="0.01" {...priceField} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="mt-1" disabled={fields.length === 1}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Notes</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
            )} />

            <div className="flex justify-end gap-2 pt-2">
              <Link href="/orders"><Button type="button" variant="outline">Cancel</Button></Link>
              <Button type="submit" disabled={pending}>{isEdit ? "Update Order" : "Create Order"}</Button>
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

