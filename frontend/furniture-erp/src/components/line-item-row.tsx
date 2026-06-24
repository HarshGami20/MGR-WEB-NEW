import type { ComponentProps } from "react";
import { useMemo } from "react";
import type { Product } from "@/api-client";
import { useListProductVariants } from "@/api-client";
import ProductVariantSelect from "@/components/product-variant-select";
import { ProductImagesField } from "@/components/product-images-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage as BaseFormMessage,
} from "@/components/ui/form";
import { ValidatedInput } from "@/components/validated-input";
import type { UseFormReturn } from "react-hook-form";
import { defaultCatalogLineItem, defaultCustomLineItem } from "@/lib/custom-line-item";
import {
  catalogLineStockHint,
  resolveCatalogLineStock,
  type BranchStock,
  type CatalogVariantRow,
} from "@/lib/product-branch-stock";
import { Package, PackagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CatalogLineImagePreview } from "@/components/catalog-line-image-preview";

type Props = {
  index: number;
  form: UseFormReturn<any>;
  products: Product[];
  onlyForLabel?: string;
  /** When true, unit price field is GST-inclusive (GST invoice orders). */
  isGstInvoice?: boolean;
  defaultGstPercent?: number;
  branchId?: number | null;
  enforceStockCheck?: boolean;
};

function FormMessage({ className, ...props }: ComponentProps<typeof BaseFormMessage>) {
  return <BaseFormMessage className={cn("static mt-1", className)} {...props} />;
}

export function LineItemRow({
  index,
  form,
  products,
  onlyForLabel = "order",
  isGstInvoice = false,
  defaultGstPercent = 18,
  branchId = null,
  enforceStockCheck = false,
}: Props) {
  const isCustom = !!form.watch(`items.${index}.isCustom`);
  const productId = Number(form.watch(`items.${index}.productId`) ?? 0);
  const variantId = form.watch(`items.${index}.variantId`) ?? null;
  const stockActive = enforceStockCheck && branchId != null && !isCustom;

  const { data: variantsData } = useListProductVariants(productId > 0 ? productId : (undefined as any), {
    query: { enabled: stockActive && productId > 0 },
  });
  const variants = (variantsData ?? []) as CatalogVariantRow[];

  const selectedProduct = useMemo(
    () =>
      products.find((p) => p.id === productId) as
        | (Product & { branchStocks?: BranchStock[]; variants?: CatalogVariantRow[] })
        | undefined,
    [products, productId],
  );

  const stockQty = useMemo(
    () => resolveCatalogLineStock(selectedProduct, variantId, variants, branchId),
    [selectedProduct, variantId, variants, branchId],
  );

  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === variantId) ?? null,
    [variants, variantId],
  );

  const catalogLineCaption = selectedProduct
    ? `${selectedProduct.name}${selectedVariant?.sku ? ` · ${selectedVariant.sku}` : selectedProduct.sku ? ` · ${selectedProduct.sku}` : ""}`
    : undefined;

  const lineItemErrors = (
    form.formState.errors.items as
      | Array<{ productId?: { message?: string }; variantId?: { message?: string } }>
      | undefined
  )?.[index];
  const productSelectionError =
    lineItemErrors?.productId?.message || lineItemErrors?.variantId?.message;

  const switchToCustom = () => {
    form.setValue(
      `items.${index}`,
      {
        ...defaultCustomLineItem,
        gstPercent: isGstInvoice ? defaultGstPercent : 0,
      },
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const switchToCatalog = () => {
    form.setValue(`items.${index}`, { ...defaultCatalogLineItem }, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={isCustom ? "outline" : "secondary"}
          className="rounded-xl h-8"
          onClick={switchToCatalog}
        >
          <Package className="h-3.5 w-3.5 mr-1.5" />
          From catalog
        </Button>
        <Button
          type="button"
          size="sm"
          variant={isCustom ? "secondary" : "outline"}
          className="rounded-xl h-8"
          onClick={switchToCustom}
        >
          <PackagePlus className="h-3.5 w-3.5 mr-1.5" />
          Custom (this {onlyForLabel} only)
        </Button>
      </div>

      {isCustom ? (
        <div className="space-y-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
          <p className="text-xs text-muted-foreground">
            Not added to the product catalog — details apply to this {onlyForLabel} only.
          </p>
          <FormField
            control={form.control}
            name={`items.${index}.customName`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Product name *</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Bespoke sofa" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField
              control={form.control}
              name={`items.${index}.customSize`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Size</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 84×36 in" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`items.${index}.customColour`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Colour</FormLabel>
                  <FormControl>
                    <ValidatedInput field={field} rule="attributeText" placeholder="e.g. Charcoal" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`items.${index}.customFabric`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Fabric</FormLabel>
                  <FormControl>
                    <ValidatedInput field={field} rule="attributeText" placeholder="e.g. Velvet" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name={`items.${index}.customImageUrls`}
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <ProductImagesField
                    value={field.value ?? []}
                    onChange={field.onChange}
                    label="Photos (optional)"
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      ) : (
        <>
          <ProductVariantSelect
            key={`line-${index}-product-${productId}-variant-${variantId ?? "none"}`}
            layout="inline"
            products={products}
            productId={productId}
            variantId={variantId}
            branchId={branchId}
            enforceStockCheck={enforceStockCheck}
            onProductChange={(pid) => {
              form.setValue(`items.${index}.productId`, pid, { shouldDirty: true, shouldValidate: true });
              form.setValue(`items.${index}.variantId`, null, { shouldDirty: true, shouldValidate: true });
              const p = products.find((it) => it.id === pid);
              form.setValue(`items.${index}.gstPercent`, isGstInvoice ? defaultGstPercent : 0, {
                shouldDirty: true,
              });
              form.setValue(`items.${index}.quantity`, 1, { shouldDirty: true, shouldValidate: true });
            }}
            onVariantChange={(vid) => {
              form.setValue(`items.${index}.variantId`, vid, { shouldDirty: true, shouldValidate: true });
              form.setValue(`items.${index}.quantity`, 1, { shouldDirty: true, shouldValidate: true });
            }}
            onPriceChange={(price) =>
              form.setValue(`items.${index}.unitPrice`, Number(price || 0), { shouldDirty: true, shouldValidate: true })
            }
          />
          {productSelectionError ? (
            <p className="text-sm font-medium text-destructive -mt-3">
              {productSelectionError}
            </p>
          ) : null}
          {productId > 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
              <CatalogLineImagePreview
                product={selectedProduct}
                variant={selectedVariant}
                caption={catalogLineCaption}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{selectedProduct?.name ?? "Product"}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {selectedVariant?.sku ?? selectedProduct?.sku ?? "—"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Tap photo to view all images
                </p>
              </div>
            </div>
          ) : null}
        </>
      )}

      <FormField
        control={form.control}
        name={`items.${index}.description`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">Description</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                value={field.value ?? ""}
                placeholder="Notes, specs, or details for this line (optional)"
                rows={2}
                className="resize-y min-h-[60px]"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name={`items.${index}.quantity`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Quantity</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="1"
                  name={field.name}
                  ref={field.ref}
                  value={field.value === "" || field.value == null ? "" : String(field.value)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      field.onChange("");
                      return;
                    }
                    const n = Number(raw);
                    if (!Number.isFinite(n)) return;
                    if (n > 0) field.onChange(n);
                  }}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    const final = Number.isFinite(n) && n > 0 ? n : 1;
                    field.onChange(final);
                    field.onBlur();
                  }}
                />
              </FormControl>
              {stockActive && stockQty != null ? (
                <p className="text-xs text-muted-foreground">
                  {catalogLineStockHint(stockQty)}
                </p>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`items.${index}.unitPrice`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">
                {isGstInvoice ? "Unit price (₹, incl. GST)" : "Unit price (₹)"}
              </FormLabel>
              <FormControl>
                <Input type="number" min="0" step="0.01" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
