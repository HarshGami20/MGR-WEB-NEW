import { useMemo } from "react";
import { Link, useLocation, Redirect } from "wouter";
import { useCreateProduct, useListCategories, getListProductsQueryKey } from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { usePermissions } from "@/lib/permissions";
import { CategoryPickerWithManage, resolveLeafCategoryId, type CategoryRoot } from "@/components/category-picker-with-manage";
import {
  attrsToJson,
  emptyVariantDraft,
  AttributesEditorBlock,
  productNewSchema,
  MAX_PRODUCT_PRICE,
  type ProductNewFormValues,
} from "@/pages/products-shared";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ProductImageField } from "@/components/product-image-field";

type ProductFormValues = ProductNewFormValues;

export default function ProductNew() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { can } = usePermissions();

  const { data: categoriesData } = useListCategories();
  const roots = useMemo(() => (Array.isArray(categoriesData) ? (categoriesData as CategoryRoot[]) : []) ?? [], [categoriesData]);

  const createProduct = useCreateProduct({
    mutation: {
      onSuccess: (created) => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        toast({ title: "Product created successfully" });
        setLocation(`/products/${created.id}`);
      },
      onError: (e: any) =>
        toast({
          title: "Could not create product",
          description: e?.message ?? "Try again.",
          variant: "destructive",
        }),
    },
  });

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productNewSchema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      parentCategoryId: "",
      subCategoryId: "",
      sku: "",
      description: "",
      price: 0,
      gstPercent: 18,
      lowStockThreshold: 10,
      inventoryMode: "simple",
      imageUrl: "",
      variants: [],
    },
  });

  const inventoryMode = form.watch("inventoryMode");
  const { fields: variantFields, append: appendVariant, remove: removeVariant } = useFieldArray({
    control: form.control,
    name: "variants",
  });

  const onSubmit = (data: ProductFormValues) => {
    const leafId = resolveLeafCategoryId(data.parentCategoryId, data.subCategoryId ?? "", roots);
    if (leafId == null) {
      toast({ title: "Invalid category", variant: "destructive" });
      return;
    }

    createProduct.mutate({
      data: {
        name: data.name,
        sku: data.sku,
        categoryId: leafId,
        imageUrl:
          data.inventoryMode === "simple" ? ((data.imageUrl && data.imageUrl.trim()) || null) : null,
        price: data.price,
        gstPercent: data.gstPercent,
        lowStockThreshold: data.lowStockThreshold,
        description: (data.description && data.description.trim()) || null,
        inventoryMode: data.inventoryMode,
        initialVariants:
          data.inventoryMode === "variants" && data.variants.length > 0
            ? data.variants.map((v) => ({
                name: v.name,
                sku: v.sku,
                imageUrl: (v.imageUrl && v.imageUrl.trim()) || null,
                price: v.price == null ? null : Number(v.price),
                lowStockThreshold: v.lowStockThreshold,
                attributes: attrsToJson(v.attributes),
              }))
            : undefined,
      },
    });
  };

  if (!can("products", "add")) {
    return <Redirect to="/products" />;
  }

  return (
    <div className="min-h-[calc(100vh-6rem)]  bg-[hsl(0_0%_97%)] -mx-4 -mt-4 px-4 py-8 md:-mx-8 md:px-8 md:py-10">
      <div className=" max-w-3xl">
        <Link href="/products">
          <Button type="button" variant="ghost" className="mb-6 -ml-2 gap-2 text-foreground hover:bg-transparent hover:text-foreground/80">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>

        <h1 className="text-2xl font-bold tracking-tight text-foreground">Add product</h1>
        <p className="mt-1 text-sm text-muted-foreground">Create a catalog item on this page. Choose a simple SKU or variants with per-option stock.</p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-8">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Product name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Milano 3-Seater Sofa"
                      maxLength={200}
                      autoComplete="off"
                      className="h-11 rounded-lg border-border/80 bg-white"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="parentCategoryId"
              render={({ field: parentField }) => (
                <FormField
                  control={form.control}
                  name="subCategoryId"
                  render={({ field: subField }) => (
                    <FormItem>
                      <CategoryPickerWithManage
                        parentCategoryId={parentField.value}
                        subCategoryId={subField.value ?? ""}
                        onParentChange={parentField.onChange}
                        onSubChange={subField.onChange}
                      />
                      {form.formState.errors.parentCategoryId?.message != null && (
                        <p className="text-sm font-medium text-destructive">{form.formState.errors.parentCategoryId.message}</p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            />

            <FormField
              control={form.control}
              name="sku"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">SKU *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. LR-SOF-001"
                      maxLength={80}
                      autoComplete="off"
                      className="h-11 rounded-lg border-border/80 bg-white font-mono text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief product description"
                      maxLength={5000}
                      className="min-h-[100px] rounded-lg border-border/80 bg-white resize-none"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-xl border border-border/60 bg-white p-5 space-y-4">
              <p className="text-sm font-semibold text-foreground">Inventory type</p>
              <FormField
                control={form.control}
                name="inventoryMode"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={(v) => {
                          field.onChange(v);
                          if (v === "simple") {
                            form.setValue("variants", []);
                          } else {
                            form.setValue("imageUrl", "");
                          }
                        }}
                        className="grid gap-3 sm:grid-cols-2"
                      >
                        <label
                          className={cn(
                            "flex cursor-pointer rounded-xl border p-4 gap-3 transition-colors",
                            field.value === "simple" ? "border-primary bg-primary/5" : "border-border/70 hover:bg-muted/30",
                          )}
                        >
                          <RadioGroupItem value="simple" id="mode-simple" className="mt-1" />
                          <div>
                            <Label htmlFor="mode-simple" className="font-semibold cursor-pointer">
                              Single SKU
                            </Label>
                            <p className="text-xs text-muted-foreground mt-1">Quantity is managed in Inventory.</p>
                          </div>
                        </label>
                        <label
                          className={cn(
                            "flex cursor-pointer rounded-xl border p-4 gap-3 transition-colors",
                            field.value === "variants" ? "border-primary bg-primary/5" : "border-border/70 hover:bg-muted/30",
                          )}
                        >
                          <RadioGroupItem value="variants" id="mode-var" className="mt-1" />
                          <div>
                            <Label htmlFor="mode-var" className="font-semibold cursor-pointer">
                              Has variants
                            </Label>
                            <p className="text-xs text-muted-foreground mt-1">Colors, sizes, etc. Quantity is managed in Inventory.</p>
                          </div>
                        </label>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {inventoryMode === "simple" && (
              <div className="rounded-xl border border-border/60 bg-white p-5 space-y-2">
                <p className="text-sm font-semibold text-foreground">Product image</p>
                <FormField
                  control={form.control}
                  name="imageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <ProductImageField
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          label="Catalog photo"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="rounded-xl border border-border/60 bg-white p-5 space-y-4">
              <p className="text-sm font-semibold text-foreground">Pricing</p>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base price (₹)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min={0}
                          max={MAX_PRODUCT_PRICE}
                          className="h-10 rounded-lg"
                          {...field}
                        />
                      </FormControl>
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
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min={0}
                          max={100}
                          className="h-10 rounded-lg"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="lowStockThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{inventoryMode === "simple" ? "Low stock threshold" : "Product-level threshold (reference)"}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        step={1}
                        min={0}
                        max={999_999_999}
                        className="h-10 rounded-lg max-w-[200px]"
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {inventoryMode === "simple"
                        ? "Quantity updates come from Inventory; this threshold is for alerts."
                        : "Each variant has its own threshold. Quantity updates come from Inventory."}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {inventoryMode === "variants" && (
              <div className="rounded-xl border border-border/60 bg-white p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Variants</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Add rows now or later from the product page.</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1 rounded-lg"
                    onClick={() =>
                      appendVariant({
                        ...emptyVariantDraft,
                        sku: `${form.getValues("sku") || "SKU"}-V${Date.now().toString().slice(-4)}`,
                      })
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add variant
                  </Button>
                </div>

                {variantFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-xl">No variants yet. Optional on create.</p>
                ) : (
                  <div className="space-y-6">
                    {variantFields.map((vf, vidx) => (
                      <div key={vf.id} className="rounded-xl border border-border/50 p-4 space-y-4 bg-[hsl(0_0%_99%)]">
                        <div className="flex justify-between items-center">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Variant {vidx + 1}</p>
                          <Button type="button" variant="ghost" size="sm" className="text-destructive h-8" onClick={() => removeVariant(vidx)}>
                            <Trash2 className="h-4 w-4 mr-1" />
                            Remove
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <FormField
                            control={form.control}
                            name={`variants.${vidx}.name`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Name *</FormLabel>
                                <FormControl>
                                  <Input maxLength={120} className="h-9" {...field} />
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
                                <FormLabel>SKU *</FormLabel>
                                <FormControl>
                                  <Input maxLength={80} className="h-9 font-mono text-sm" {...field} />
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
                        <div className="grid grid-cols-2 gap-3">
                          <FormField
                            control={form.control}
                            name={`variants.${vidx}.price`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Price (₹)</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.01"
                                    min={0}
                                    max={MAX_PRODUCT_PRICE}
                                    className="h-9"
                                    placeholder="Base"
                                    {...field}
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
                          <FormField
                            control={form.control}
                            name={`variants.${vidx}.lowStockThreshold`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Low at</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    inputMode="numeric"
                                    step={1}
                                    min={0}
                                    max={999_999_999}
                                    className="h-9"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <AttributesEditorBlock control={form.control} namePrefix={`variants.${vidx}.attributes`} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Button
              type="submit"
              className="h-12 w-full max-w-md rounded-xl  font-semibold"
              disabled={createProduct.isPending}
            >
              {createProduct.isPending ? "Creating…" : "Create product"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
