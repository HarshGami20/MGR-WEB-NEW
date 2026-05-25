import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { Link, Redirect, useLocation, useRoute } from "wouter";
import type { UpdateProductBody, UpdateProductVariantBody } from "@/api-client";
import {
  useGetProduct,
  useGetSettings,
  useUpdateProduct,
  useListCategories,
  useListProductVariants,
  useCreateProductVariant,
  useUpdateProductVariant,
  useDeleteProductVariant,
  getListProductsQueryKey,
  getGetProductQueryKey,
  getListProductVariantsQueryKey,
} from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { useFieldArray, useForm } from "react-hook-form";
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
import {
  CategoryPickerWithManage,
  resolveLeafCategoryId,
  splitCategoryForForm,
  type CategoryRoot,
} from "@/components/category-picker-with-manage";
import {
  attrsToJson,
  jsonToAttrs,
  variantDraftWithPersistedIdSchema,
  emptyVariantDraft,
  AttributesEditorBlock,
  productVariantToDraftRow,
  variantImagesToApi,
  productEditSchema,
  ProductFormSection,
  MAX_PRODUCT_PRICE,
  type ProductEditFormValues,
} from "@/pages/products-shared";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ProductImagesField } from "@/components/product-images-field";
import { productImageList, variantImageList } from "@/lib/image-urls";

type ProductFormValues = ProductEditFormValues;

function FormMessage({ className, ...props }: ComponentProps<typeof BaseFormMessage>) {
  return <BaseFormMessage className={cn("static mt-1", className)} {...props} />;
}

function variantToUpdateBody(v: z.infer<typeof variantDraftWithPersistedIdSchema>): UpdateProductVariantBody {
  const imgs = variantImagesToApi(v);
  return {
    name: v.name,
    sku: v.sku,
    imageUrl: imgs.imageUrl,
    imageUrls: imgs.imageUrls,
    price: v.price == null ? null : Number(v.price),
    lowStockThreshold: v.lowStockThreshold,
    attributes: attrsToJson(v.attributes),
  } as UpdateProductVariantBody;
}

export default function ProductEdit() {
  const [, params] = useRoute("/products/:id/edit");
  const [, setLocation] = useLocation();
  const productId = params?.id ? parseInt(params.id, 10) : NaN;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { can } = usePermissions();

  const [isSaving, setIsSaving] = useState(false);
  const [formHydrated, setFormHydrated] = useState(false);
  /** Lets us run hydrate again when category tree / variants arrive after the first pass (full page refresh). */
  const lastHydrateKeyRef = useRef<string>("");
  const initialServerVariantIdsRef = useRef<number[]>([]);

  const { data: product, isLoading, isError, isFetching } = useGetProduct(productId, {
    query: {
      enabled: Number.isFinite(productId) && productId > 0,
      refetchOnMount: "always",
    },
  });

  const {
    data: variantsData,
    isFetched: variantsFetched,
    isLoading: variantsLoading,
  } = useListProductVariants(productId, {
    query: { enabled: Number.isFinite(productId) && productId > 0 },
  });

  const variantList = useMemo(
    () => (Array.isArray(variantsData) ? variantsData : []),
    [variantsData],
  );

  const { data: settingsData } = useGetSettings();
  const defaultGstPercent = settingsData?.defaultGstPercent ?? 18;
  const { data: categoriesData, isFetched: categoriesFetched } = useListCategories();
  const categoryRoots = useMemo(
    () => (Array.isArray(categoriesData) ? (categoriesData as CategoryRoot[]) : []) ?? [],
    [categoriesData],
  );

  const updateProduct = useUpdateProduct();

  const createVariant = useCreateProductVariant();
  const updateVariant = useUpdateProductVariant();
  const deleteVariant = useDeleteProductVariant();

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productEditSchema),
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

  const inventoryMode = form.watch("inventoryMode");
  const { fields: variantFields, append: appendVariant, remove: removeVariant } = useFieldArray({
    control: form.control,
    name: "variants",
  });

  useEffect(() => {
    lastHydrateKeyRef.current = "";
    initialServerVariantIdsRef.current = [];
    setFormHydrated(false);
  }, [productId]);

  const productCategory = product?.category;
  const categoriesResolved =
    product?.categoryId == null ||
    productCategory != null ||
    categoryRoots.length > 0;
  const variantsReady =
    variantsFetched &&
    !((product?.variantCount ?? 0) > 0 && variantList.length === 0 && variantsLoading);

  useEffect(() => {
    if (!product || !variantsReady || !categoriesFetched || !categoriesResolved) return;

    const vc = product.variantCount ?? 0;

    const split = splitCategoryForForm(product, categoryRoots);
    if (product.categoryId != null && !split.parentCategoryId) return;
    const variantIdsSig = variantList
      .map((v) => v.id)
      .sort((a, b) => a - b)
      .join(",");
    const variantMediaSig = variantList
      .map((v) => `${v.id}:${variantImageList(v as { imageUrls?: string | string[] | null; imageUrl?: string | null }).join("|")}`)
      .sort()
      .join(";");

    const hydrateKey = [
      product.id,
      product.categoryId ?? "",
      productImageList(product as { imageUrls?: string | string[] | null; imageUrl?: string | null }).join("|"),
      String((product as { attributes?: string | null }).attributes ?? ""),
      categoryRoots.length,
      variantIdsSig,
      variantMediaSig,
      split.parentCategoryId,
      split.subCategoryId,
    ].join("|");

    if (lastHydrateKeyRef.current === hydrateKey) {
      if (!formHydrated) setFormHydrated(true);
      return;
    }
    lastHydrateKeyRef.current = hydrateKey;

    const hadServerVariants = vc > 0;
    const mode = hadServerVariants ? "variants" : "simple";
    const variantRows = variantList.map(productVariantToDraftRow);
    initialServerVariantIdsRef.current = variantRows.map((r) => r.variantId!).filter((id): id is number => id != null);

    const current = form.getValues();
    const { parentCategoryId: parentDirty, subCategoryId: subDirty } = form.formState.dirtyFields;
    const preserveCategoryEdits = formHydrated && (parentDirty || subDirty);

    form.reset({
      name: product.name,
      sku: product.sku,
      parentCategoryId: preserveCategoryEdits ? current.parentCategoryId : split.parentCategoryId,
      subCategoryId: preserveCategoryEdits ? current.subCategoryId ?? "" : split.subCategoryId,
      description: product.description || "",
      price: hadServerVariants ? 0 : product.price,
      lowStockThreshold: product.lowStockThreshold,
      inventoryMode: mode,
      imageUrls: productImageList(product as { imageUrls?: string | string[] | null; imageUrl?: string | null }),
      attributes: hadServerVariants ? [] : jsonToAttrs((product as { attributes?: string | null }).attributes),
      variants: hadServerVariants ? variantRows : [],
    });
    setFormHydrated(true);
  }, [
    product,
    variantsReady,
    categoriesFetched,
    categoriesResolved,
    categoryRoots,
    variantList,
    form,
    formHydrated,
  ]);

  const invalidateProductQueries = () => {
    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(productId) });
    queryClient.invalidateQueries({ queryKey: getListProductVariantsQueryKey(productId) });
  };

  const onSubmit = async (data: ProductFormValues) => {
    const leafId = resolveLeafCategoryId(data.parentCategoryId, data.subCategoryId ?? "", categoryRoots);
    if (leafId == null) {
      toast({ title: "Invalid category", variant: "destructive" });
      return;
    }

    if (
      data.inventoryMode === "variants" &&
      initialServerVariantIdsRef.current.length > 0 &&
      data.variants.length === 0
    ) {
      toast({
        title: "Add at least one variant",
        description: "Or switch to Single SKU to remove all variants.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      name: data.name,
      sku: data.sku,
      categoryId: leafId,
      price: data.inventoryMode === "variants" ? 0 : data.price,
      lowStockThreshold: data.lowStockThreshold,
      description: (data.description && data.description.trim()) || null,
      imageUrls: data.imageUrls,
      imageUrl: data.imageUrls[0] ?? null,
      attributes: data.inventoryMode === "simple" ? attrsToJson(data.attributes) : null,
    } as unknown as UpdateProductBody;

    setIsSaving(true);
    try {
      await updateProduct.mutateAsync({ id: productId, data: payload });

      if (data.inventoryMode === "simple") {
        for (const id of initialServerVariantIdsRef.current) {
          try {
            await deleteVariant.mutateAsync({ productId, variantId: id });
          } catch {
            /* may already be deleted */
          }
        }
      } else {
        const keptIds = new Set(
          data.variants.map((v) => v.variantId).filter((id): id is number => id != null),
        );
        for (const id of initialServerVariantIdsRef.current) {
          if (!keptIds.has(id)) {
            await deleteVariant.mutateAsync({ productId, variantId: id });
          }
        }
        for (const v of data.variants) {
          const payload = variantToUpdateBody(v);
          if (v.variantId != null) {
            await updateVariant.mutateAsync({
              productId,
              variantId: v.variantId,
              data: payload,
            });
          } else {
            await createVariant.mutateAsync({
              productId,
              data: {
                name: v.name,
                sku: v.sku,
                ...variantImagesToApi(v),
                price: v.price == null ? null : Number(v.price),
                lowStockThreshold: v.lowStockThreshold,
                attributes: attrsToJson(v.attributes),
              } as any,
            });
          }
        }
      }

      invalidateProductQueries();
      toast({ title: "Product updated" });
      setLocation(`/products/${productId}`);
    } catch (e: unknown) {
      toast({
        title: "Save failed",
        description: String((e as { message?: string })?.message ?? e),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!Number.isFinite(productId) || productId <= 0) {
    return <Redirect to="/products" />;
  }

  if (!can("products", "edit")) {
    return <Redirect to={`/products/${productId}`} />;
  }

  const pageLoading =
    isLoading ||
    isFetching ||
    !product ||
    !categoriesFetched ||
    !categoriesResolved ||
    !variantsReady ||
    !formHydrated;

  if (pageLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading…</div>
    );
  }

  if (isError || !product) {
    return (
      <div className="space-y-4 p-6">
        <p className="text-muted-foreground">Product not found.</p>
        <Link href="/products">
          <Button variant="outline">Back to products</Button>
        </Link>
      </div>
    );
  }

  const busy = isSaving || updateProduct.isPending;

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-muted/40 -mx-4 -mt-4 px-4 py-6 md:-mx-8 md:px-8 md:py-8">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <Link href={`/products/${productId}`}>
                <Button type="button" variant="ghost" size="icon" className="mt-0.5 shrink-0 rounded-full">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Edit product</h1>
                  <Badge variant="secondary" className="font-normal">
                    #{productId}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground truncate" title={product.name}>
                  {product.name}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href={`/products/${productId}`}>
                <Button type="button" variant="outline" className="rounded-xl px-5" disabled={busy}>
                  Cancel
                </Button>
              </Link>
              <Button type="submit" className="rounded-xl px-6 shadow-sm" disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
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
                name="subCategoryId"
                render={({ field: subField }) => (
                  <input type="hidden" {...subField} value={subField.value ?? ""} />
                )}
              />
              <FormField
                control={form.control}
                name="parentCategoryId"
                render={() => (
                  <FormItem>
                    <CategoryPickerWithManage
                      roots={categoryRoots}
                      parentCategoryId={form.watch("parentCategoryId") ?? ""}
                      subCategoryId={form.watch("subCategoryId") ?? ""}
                      onParentChange={(v) => {
                        form.setValue("parentCategoryId", v, { shouldDirty: true, shouldValidate: true });
                        form.setValue("subCategoryId", "", { shouldDirty: true });
                      }}
                      onSubChange={(v) => {
                        form.setValue("subCategoryId", v, { shouldDirty: true, shouldValidate: true });
                      }}
                    />
                    {form.formState.errors.parentCategoryId?.message != null && (
                      <p className="text-sm font-medium text-destructive">{form.formState.errors.parentCategoryId.message}</p>
                    )}
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
                            if (product) {
                              form.setValue(
                                "imageUrls",
                                productImageList(product as { imageUrls?: string | string[] | null; imageUrl?: string | null }),
                              );
                              form.setValue(
                                "attributes",
                                jsonToAttrs((product as { attributes?: string | null }).attributes),
                              );
                            }
                            form.setValue("price", Number(product?.price ?? 0));
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
                          <RadioGroupItem value="simple" id="edit-mode-simple" className="mt-1" />
                          <div>
                            <Label htmlFor="edit-mode-simple" className="font-semibold cursor-pointer">
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
                          <RadioGroupItem value="variants" id="edit-mode-var" className="mt-1" />
                          <div>
                            <Label htmlFor="edit-mode-var" className="font-semibold cursor-pointer">
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
              <ProductFormSection title="Variants" description="Edit existing rows or add new ones.">
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
                  <p className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-xl">
                    No variants in the form. Add rows here or switch to Single SKU (removes all variants when you save).
                  </p>
                ) : (
                  <div className="space-y-6">
                    {variantFields.map((vf, vidx) => (
                      <div key={vf.id} className="rounded-xl border border-border/50 p-4 space-y-4 bg-[hsl(0_0%_99%)]">
                        <div className="flex justify-between items-center">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Variant {vidx + 1}
                            {form.watch(`variants.${vidx}.variantId`) != null ? (
                              <span className="ml-2 font-normal normal-case text-muted-foreground">(saved)</span>
                            ) : null}
                          </p>
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
            <Link href={`/products/${productId}`} className="w-fit">
              <Button type="button" variant="outline" className="w-fit rounded-xl px-6 sm:w-auto" disabled={busy}>
                Cancel
              </Button>
            </Link>
            <Button type="submit" className="w-full rounded-xl px-8 shadow-sm sm:w-auto" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
