import { useEffect, useMemo } from "react";
import { Link, Redirect, useLocation, useRoute } from "wouter";
import {
  getGetPurchaseOrderQueryKey,
  getListPurchaseOrdersQueryKey,
  useGetPurchaseOrder,
  useListManufacturers,
  useListProducts,
  useListSuppliers,
  useUpdatePurchaseOrder,
} from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LineItemRow } from "@/components/line-item-row";
import { apiItemToFormValues, lineItemFormSchema, lineItemToApiPayload } from "@/lib/line-item-form-schema";
import { defaultCatalogLineItem } from "@/lib/custom-line-item";
import { usePermissions } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { isPartnerPortalUser } from "@/lib/partner";
import { useAuth } from "@/lib/auth";

function todayDateInputValue(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const poSchema = z.object({
  type: z.enum(["supplier", "manufacturer"]),
  supplierId: z.coerce.number().optional().nullable(),
  manufacturerId: z.coerce.number().optional().nullable(),
  items: z.array(lineItemFormSchema).min(1, "At least one item is required"),
  expectedDelivery: z
    .string()
    .optional()
    .nullable()
    .refine((value) => !value || value >= todayDateInputValue(), {
      message: "Expected delivery cannot be in the past",
    }),
  notes: z.string().optional().nullable(),
});

type POFormValues = z.infer<typeof poSchema>;

const NON_EDITABLE_STATUSES = new Set(["delivered", "cancelled"]);

export default function PurchaseOrderEditPage() {
  const [, params] = useRoute("/purchase-orders/:id/edit");
  const [, setLocation] = useLocation();
  const { can } = usePermissions();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const poId = Number(params?.id);
  const validId = Number.isFinite(poId) && poId > 0;

  const { data: po, isLoading, isError } = useGetPurchaseOrder(poId, {
    query: { enabled: validId },
  });

  const { data: suppliersData } = useListSuppliers({ limit: 100 });
  const { data: manufacturersData } = useListManufacturers({ limit: 100 });
  const { data: productsData } = useListProducts({ limit: 1000 });

  const updatePO = useUpdatePurchaseOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPurchaseOrderQueryKey(poId) });
        toast({ title: "Purchase order updated" });
        setLocation(`/purchase-orders/${poId}`);
      },
      onError: (e: { data?: { error?: string }; message?: string }) =>
        toast({
          title: "Update failed",
          description: e?.data?.error ?? e?.message,
          variant: "destructive",
        }),
    },
  });

  const defaultValues = useMemo<POFormValues>(
    () => ({
      type: "supplier",
      supplierId: undefined,
      manufacturerId: undefined,
      items: [{ ...defaultCatalogLineItem }],
      expectedDelivery: "",
      notes: "",
    }),
    [],
  );

  const form = useForm<POFormValues>({
    resolver: zodResolver(poSchema),
    defaultValues,
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "items",
  });

  useEffect(() => {
    if (!po) return;
    const poAny = po as {
      type?: string;
      supplierId?: number | null;
      manufacturerId?: number | null;
      items?: Parameters<typeof apiItemToFormValues>[0][];
      expectedDelivery?: string | null;
      notes?: string | null;
    };
    const type = poAny.type === "manufacturer" ? "manufacturer" : "supplier";
    const items =
      poAny.items?.length
        ? poAny.items.map((item) => apiItemToFormValues(item))
        : [{ ...defaultCatalogLineItem }];
    form.reset({
      type,
      supplierId: poAny.supplierId ?? undefined,
      manufacturerId: poAny.manufacturerId ?? undefined,
      items,
      expectedDelivery: poAny.expectedDelivery
        ? new Date(poAny.expectedDelivery).toISOString().slice(0, 10)
        : "",
      notes: poAny.notes ?? "",
    });
    replace(items);
  }, [po, form, replace]);

  const watchType = form.watch("type");

  if (isPartnerPortalUser(user)) {
    return <Redirect to="/purchase-orders" />;
  }

  if (!can("purchaseOrders", "edit")) {
    return <Redirect to={validId ? `/purchase-orders/${poId}` : "/purchase-orders"} />;
  }

  if (!validId || isError) {
    return <Redirect to="/purchase-orders" />;
  }

  if (!isLoading && po && NON_EDITABLE_STATUSES.has(po.status)) {
    return <Redirect to={`/purchase-orders/${poId}`} />;
  }

  const onSubmit = (data: POFormValues) => {
    if (data.type === "supplier" && !data.supplierId) {
      form.setError("supplierId", { message: "Supplier is required" });
      return;
    }
    if (data.type === "manufacturer" && !data.manufacturerId) {
      form.setError("manufacturerId", { message: "Manufacturer is required" });
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
      type: data.type,
      supplierId: data.type === "supplier" ? data.supplierId ?? null : null,
      manufacturerId: data.type === "manufacturer" ? data.manufacturerId ?? null : null,
      items: data.items.map((item) => lineItemToApiPayload(item)),
      expectedDelivery: data.expectedDelivery || null,
      notes: data.notes?.trim() || null,
    };

    updatePO.mutate({ id: poId, data: payload as any });
  };

  if (isLoading || !po) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Loading purchase order…
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-muted/40 -mx-4 -mt-4 px-4 py-6 md:-mx-8 md:px-8 md:py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/purchase-orders/${poId}`}>
            <Button type="button" variant="ghost" size="icon" className="rounded-full" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Edit {po.poNumber}</h1>
            <p className="text-sm text-muted-foreground">Update vendor, line items, and delivery details</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm md:p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PO Type</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="supplier">Supplier (Ready Goods)</SelectItem>
                          <SelectItem value="manufacturer">Manufacturer (Custom)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchType === "supplier" ? (
                  <FormField
                    control={form.control}
                    name="supplierId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Supplier</FormLabel>
                        <Select
                          value={field.value ? field.value.toString() : ""}
                          onValueChange={(val) => field.onChange(parseInt(val, 10))}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Supplier" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {suppliersData?.data?.map((s) => (
                              <SelectItem key={s.id} value={s.id.toString()}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={form.control}
                    name="manufacturerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Manufacturer</FormLabel>
                        <Select
                          value={field.value ? field.value.toString() : ""}
                          onValueChange={(val) => field.onChange(parseInt(val, 10))}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Manufacturer" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {manufacturersData?.data?.map((m) => (
                              <SelectItem key={m.id} value={m.id.toString()}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-medium">Items</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ ...defaultCatalogLineItem })}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add item
                  </Button>
                </div>

                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-start gap-2 rounded-md border p-3">
                    <div className="flex-1">
                      <LineItemRow
                        index={index}
                        form={form}
                        products={productsData?.data ?? []}
                        onlyForLabel="PO"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                      className="mt-1"
                      disabled={fields.length === 1}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="expectedDelivery"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expected Delivery Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          min={todayDateInputValue()}
                          {...field}
                          value={field.value || ""}
                          onChange={(event) => field.onChange(event.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Optional notes for the vendor"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setLocation(`/purchase-orders/${poId}`)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updatePO.isPending}>
                  Save changes
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
