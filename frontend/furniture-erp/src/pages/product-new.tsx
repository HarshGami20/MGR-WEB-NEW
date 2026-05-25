import { useMemo, type ComponentProps } from "react";
import { Link, useLocation, Redirect } from "wouter";
import { useCreateProduct, useGetSettings, useListCategories, getListProductsQueryKey } from "@/api-client";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage as BaseFormMessage,
} from "@/components/ui/form";
import { usePermissions } from "@/lib/permissions";
import { CategoryPickerWithManage, resolveLeafCategoryId, type CategoryRoot } from "@/components/category-picker-with-manage";
import {
  attrsToJson,
  variantImagesToApi,
  emptyVariantDraft,
  AttributesEditorBlock,
  productNewSchema,
  ProductFormSection,
  MAX_PRODUCT_PRICE,
  type ProductNewFormValues,
} from "@/pages/products-shared";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ProductImagesField } from "@/components/product-images-field";

type ProductFormValues = ProductNewFormValues;

function FormMessage({ className, ...props }: ComponentProps<typeof BaseFormMessage>) {
  return <BaseFormMessage className={cn("static mt-1", className)} {...props} />;
}

export default function ProductNew() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { can } = usePermissions();

  const { data: categoriesData } = useListCategories();
  const { data: settingsData } = useGetSettings();
  const defaultGstPercent = settingsData?.defaultGstPercent ?? 18;
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
      lowStockThreshold: 10,
      inventoryMode: "simple",
      imageUrls: [],
      attributes: [],
      variants: [],
    },
  });

  const pending = createProduct.isPending;
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
        imageUrls: data.imageUrls.length > 0 ? data.imageUrls : undefined,
        imageUrl: data.imageUrls[0] ?? null,
        price: data.inventoryMode === "variants" ? 0 : data.price,
        lowStockThreshold: data.lowStockThreshold,
        description: (data.description && data.description.trim()) || null,
        inventoryMode: data.inventoryMode,
        attributes: data.inventoryMode === "simple" ? attrsToJson(data.attributes) : null,
        initialVariants:
          data.inventoryMode === "variants" && data.variants.length > 0
            ? data.variants.map((v) => ({
                name: v.name,
                sku: v.sku,
                ...variantImagesToApi(v),
                price: v.price == null ? null : Number(v.price),
                lowStockThreshold: v.lowStockThreshold,
                attributes: attrsToJson(v.attributes),
              }))
            : undefined,
      } as any,
    });
  };

  if (!can("products", "add")) {
    return <Redirect to="/products" />;
  }

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-muted/40 -mx-4 -mt-4 px-4 py-6 md:-mx-8 md:px-8 md:py-8">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <Link href="/products">
                <Button type="button" variant="ghost" size="icon" className="mt-0.5 shrink-0 rounded-full">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Create product</h1>
                  <Badge variant="outline" className="font-normal">
                    New
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Catalog details, inventory type, photos, and pricing.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href="/products">
                <Button type="button" variant="outline" className="rounded-xl px-5">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" className="rounded-xl px-6 shadow-sm" disabled={pending}>
                {pending ? "Creating…" : "Create product"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-8">
            <ProductFormSection title="Product details" description="Name, category, SKU, and description.">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Milano 3-Seater Sofa"
                        maxLength={200}
                        autoComplete="off"
                        className="rounded-xl"
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
                          <p className="text-sm font-medium text-destructive -mt-2.5">{form.formState.errors.parentCategoryId.message}</p>
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
                    <FormLabel>SKU *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. LR-SOF-001"
                        maxLength={80}
                        autoComplete="off"
                        className="rounded-xl font-mono text-sm"
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
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Brief product description"
                        maxLength={5000}
                        className="min-h-[100px] rounded-xl resize-y"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </ProductFormSection>

            <ProductFormSection title="Inventory type" description="Single SKU or multiple variants.">
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
                            form.setValue("attributes", []);
                            form.setValue("price", 0);
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
            </ProductFormSection>

            {inventoryMode === "simple" ? (
              <ProductFormSection
                title="Product variables"
                description="Size, colour, fabric, and other specs (optional)."
              >
                <AttributesEditorBlock control={form.control} namePrefix="attributes" />
              </ProductFormSection>
            ) : null}

            {inventoryMode === "variants" ? (
              <ProductFormSection title="Variants" description="Add rows now or later from the product page.">
                <div className="flex justify-end">
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
                          name={`variants.${vidx}.imageUrls`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <ProductImagesField
                                  value={Array.isArray(field.value) ? field.value : []}
                                  onChange={(urls) => field.onChange(urls)}
                                  label="Variant photos"
                                />
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
                                    placeholder="e.g. 12999"
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
              </ProductFormSection>
            ) : null}

            </div>

            <aside className="space-y-6 lg:col-span-4 lg:sticky lg:top-6 lg:self-start">
              <ProductFormSection title="Product photos" description="First image is the main thumbnail.">
                <FormField
                  control={form.control}
                  name="imageUrls"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <ProductImagesField value={field.value ?? []} onChange={field.onChange} label="Catalog photos" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </ProductFormSection>

              {inventoryMode === "simple" ? (
                <ProductFormSection title="Pricing & stock" description="Base price and low-stock alert level.">
                  <div className="space-y-4">
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
                              className="rounded-xl"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lowStockThreshold"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Low stock threshold</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              inputMode="numeric"
                              step={1}
                              min={0}
                              max={999_999_999}
                              className="rounded-xl"
                              {...field}
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            Quantity updates come from Inventory.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </ProductFormSection>
              ) : (
                <ProductFormSection title="Stock alerts" description="Default threshold for new variants.">
                  <FormField
                    control={form.control}
                    name="lowStockThreshold"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product-level threshold</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            inputMode="numeric"
                            step={1}
                            min={0}
                            max={999_999_999}
                            className="rounded-xl"
                            {...field}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Each variant can override this.</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </ProductFormSection>
              )}

              <ProductFormSection title="GST" description="Applied on orders and invoices.">
                <p className="text-sm text-muted-foreground">
                  Default rate: <span className="font-medium text-foreground tabular-nums">{defaultGstPercent}%</span>
                  {" "}
                  (change in Settings)
                </p>
              </ProductFormSection>
            </aside>
          </div>

          <div className="flex justify-end gap-3">
            <Link href="/products" className="w-fit">
              <Button type="button" variant="outline" className="w-fit rounded-xl px-6 sm:w-auto">
                Cancel
              </Button>
            </Link>
            <Button type="submit" className="w-full rounded-xl px-8 shadow-sm sm:w-auto" disabled={pending}>
              {pending ? "Creating…" : "Create product"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
