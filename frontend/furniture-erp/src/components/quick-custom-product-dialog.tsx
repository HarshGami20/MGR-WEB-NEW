import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateProduct,
  getListProductsQueryKey,
  listProductVariants,
  type Product,
} from "@/api-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ProductImageField } from "@/components/product-image-field";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/lib/permissions";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  emptyVariantDraft,
  MAX_PRODUCT_PRICE,
  PRODUCT_SKU_REGEX,
  refineOptionalImageUrlField,
} from "@/pages/products-shared";

function generateCustomSku() {
  return `CUST-${Date.now().toString(36).toUpperCase().slice(-8)}`;
}

const variantRowSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  sku: z.string().trim().min(1, "SKU is required").max(80).regex(PRODUCT_SKU_REGEX, "Invalid SKU format"),
  price: z.coerce.number().min(0).max(MAX_PRODUCT_PRICE).nullable().optional(),
  imageUrl: z.string().max(500).optional(),
});

const quickProductSchema = z
  .object({
    name: z.string().trim().min(2, "Product name is required").max(200),
    sku: z
      .string()
      .trim()
      .min(1, "SKU is required")
      .max(80)
      .regex(PRODUCT_SKU_REGEX, "Use letters, numbers, hyphens, underscores, or slashes"),
    inventoryMode: z.enum(["simple", "variants"]),
    price: z.coerce.number().min(0).max(MAX_PRODUCT_PRICE),
    gstPercent: z.coerce.number().min(0).max(100),
    imageUrl: z.string().max(500).optional(),
    variants: z.array(variantRowSchema),
  })
  .superRefine((data, ctx) => {
    if (data.inventoryMode === "simple") {
      refineOptionalImageUrlField(data.imageUrl, ["imageUrl"], ctx);
      return;
    }
    if (data.variants.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add at least one variant",
        path: ["variants"],
      });
    }
    const base = data.sku.trim().toLowerCase();
    const seen = new Set<string>();
    data.variants.forEach((v, i) => {
      refineOptionalImageUrlField(v.imageUrl, ["variants", i, "imageUrl"], ctx);
      const vs = v.sku.trim().toLowerCase();
      if (seen.has(vs)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate variant SKU", path: ["variants", i, "sku"] });
      }
      seen.add(vs);
      if (vs === base) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Variant SKU must differ from product SKU",
          path: ["variants", i, "sku"],
        });
      }
    });
  });

type QuickProductFormValues = z.infer<typeof quickProductSchema>;

export type QuickCustomProductResult = {
  productId: number;
  variantId: number | null;
  unitPrice: number;
  product: Product;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (result: QuickCustomProductResult) => void;
};

export function QuickCustomProductDialog({ open, onOpenChange, onCreated }: Props) {
  const { toast } = useToast();
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  const form = useForm<QuickProductFormValues>({
    resolver: zodResolver(quickProductSchema),
    defaultValues: {
      name: "",
      sku: generateCustomSku(),
      inventoryMode: "simple",
      price: 0,
      gstPercent: 18,
      imageUrl: "",
      variants: [],
    },
  });

  const inventoryMode = form.watch("inventoryMode");
  const { fields: variantFields, append: appendVariant, remove: removeVariant } = useFieldArray({
    control: form.control,
    name: "variants",
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: "",
      sku: generateCustomSku(),
      inventoryMode: "simple",
      price: 0,
      gstPercent: 18,
      imageUrl: "",
      variants: [],
    });
  }, [open, form]);

  const createProduct = useCreateProduct();

  const onSubmit = async (data: QuickProductFormValues) => {
    if (!can("products", "add")) {
      toast({
        title: "Permission required",
        description: "You need permission to add products to create a custom product.",
        variant: "destructive",
      });
      return;
    }

    try {
      const created = await createProduct.mutateAsync({
        data: {
          name: data.name.trim(),
          sku: data.sku.trim(),
          categoryId: null,
          imageUrl: data.inventoryMode === "simple" ? (data.imageUrl?.trim() || null) : null,
          price: data.inventoryMode === "variants" ? 0 : data.price,
          gstPercent: data.gstPercent,
          lowStockThreshold: 10,
          description: null,
          inventoryMode: data.inventoryMode,
          stockQty: 0,
          initialVariants:
            data.inventoryMode === "variants"
              ? data.variants.map((v) => ({
                  name: v.name.trim(),
                  sku: v.sku.trim(),
                  imageUrl: (v.imageUrl && v.imageUrl.trim()) || null,
                  price: v.price == null ? null : Number(v.price),
                  stockQty: 0,
                  lowStockThreshold: 10,
                  attributes: null,
                }))
              : undefined,
        },
      });

      await queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });

      let variantId: number | null = null;
      let unitPrice = Number(created.price ?? 0);

      if (data.inventoryMode === "variants" && data.variants.length > 0) {
        try {
          const variants = await listProductVariants(created.id);
          const match = variants.find((v) => v.sku === data.variants[0]?.sku.trim()) ?? variants[0];
          if (match) {
            variantId = match.id;
            unitPrice = Number(match.price ?? created.price ?? 0);
          }
        } catch {
          unitPrice = Number(data.variants[0]?.price ?? created.price ?? 0);
        }
      } else {
        unitPrice = Number(data.price);
      }

      toast({ title: "Custom product created", description: "Added to your line item." });
      onCreated({
        productId: created.id,
        variantId,
        unitPrice,
        product: created as Product,
      });
      onOpenChange(false);
    } catch (e: unknown) {
      const err = e as { data?: { error?: string }; message?: string };
      toast({
        title: "Could not create product",
        description: err?.data?.error ?? err?.message ?? "Try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create custom product</DialogTitle>
          <DialogDescription>
            Add a bespoke product with optional variants and image. It is saved to the catalog and selected on this
            line.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Product name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Custom sofa — 3 seater" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU *</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input className="font-mono text-sm" {...field} />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => field.onChange(generateCustomSku())}
                      >
                        Auto
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gstPercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GST (%)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} max={100} step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="inventoryMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        if (v === "simple") {
                          form.setValue("variants", []);
                        } else {
                          form.setValue("imageUrl", "");
                          if (form.getValues("variants").length === 0) {
                            const base = form.getValues("sku") || "SKU";
                            appendVariant({ ...emptyVariantDraft, sku: `${base}-V1` });
                          }
                        }
                      }}
                      className="grid gap-2 sm:grid-cols-2"
                    >
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm",
                          field.value === "simple" ? "border-primary bg-primary/5" : "border-border",
                        )}
                      >
                        <RadioGroupItem value="simple" />
                        Single product
                      </label>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm",
                          field.value === "variants" ? "border-primary bg-primary/5" : "border-border",
                        )}
                      >
                        <RadioGroupItem value="variants" />
                        With variants
                      </label>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {inventoryMode === "simple" ? (
              <>
                <FormField
                  control={form.control}
                  name="imageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <ProductImageField value={field.value ?? ""} onChange={field.onChange} label="Product image" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price (₹) *</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step="0.01" max={MAX_PRODUCT_PRICE} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            ) : (
              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Variants</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const base = form.getValues("sku") || "SKU";
                      appendVariant({ ...emptyVariantDraft, sku: `${base}-V${variantFields.length + 1}` });
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add variant
                  </Button>
                </div>
                {variantFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                    Add at least one variant.
                  </p>
                ) : (
                  variantFields.map((vf, vidx) => (
                    <div key={vf.id} className="space-y-3 rounded-lg border bg-muted/20 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Variant {vidx + 1}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-destructive"
                          onClick={() => removeVariant(vidx)}
                          disabled={variantFields.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name={`variants.${vidx}.name`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Name *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="e.g. Blue / Large" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`variants.${vidx}.sku`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">SKU *</FormLabel>
                              <FormControl>
                                <Input className="font-mono text-sm" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`variants.${vidx}.price`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Price (₹)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={field.value ?? ""}
                                  onChange={(e) =>
                                    field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))
                                  }
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name={`variants.${vidx}.imageUrl`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <ProductImageField value={field.value ?? ""} onChange={field.onChange} label="Variant image" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  ))
                )}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createProduct.isPending}>
                {createProduct.isPending ? "Creating…" : "Create & use"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
