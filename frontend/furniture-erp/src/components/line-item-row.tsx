import type { Product } from "@/api-client";
import ProductVariantSelect from "@/components/product-variant-select";
import { ProductImagesField } from "@/components/product-images-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ValidatedInput } from "@/components/validated-input";
import type { UseFormReturn } from "react-hook-form";
import { defaultCatalogLineItem, defaultCustomLineItem } from "@/lib/custom-line-item";
import { Package, PackagePlus } from "lucide-react";

type Props = {
  index: number;
  form: UseFormReturn<any>;
  products: Product[];
  onlyForLabel?: string;
  /** When true, unit price field is GST-inclusive (GST invoice orders). */
  isGstInvoice?: boolean;
  defaultGstPercent?: number;
};

export function LineItemRow({
  index,
  form,
  products,
  onlyForLabel = "order",
  isGstInvoice = false,
  defaultGstPercent = 18,
}: Props) {
  const isCustom = !!form.watch(`items.${index}.isCustom`);
  const productId = Number(form.watch(`items.${index}.productId`) ?? 0);
  const variantId = form.watch(`items.${index}.variantId`) ?? null;

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
            products={products}
            productId={productId}
            variantId={variantId}
            onProductChange={(pid) => {
              form.setValue(`items.${index}.productId`, pid, { shouldDirty: true, shouldValidate: true });
              form.setValue(`items.${index}.variantId`, null, { shouldDirty: true, shouldValidate: true });
              const p = products.find((it) => it.id === pid);
              form.setValue(`items.${index}.gstPercent`, isGstInvoice ? defaultGstPercent : 0, {
                shouldDirty: true,
              });
            }}
            onVariantChange={(vid) =>
              form.setValue(`items.${index}.variantId`, vid, { shouldDirty: true, shouldValidate: true })
            }
            onPriceChange={(price) =>
              form.setValue(`items.${index}.unitPrice`, Number(price || 0), { shouldDirty: true, shouldValidate: true })
            }
          />
          {(form.formState.errors.items?.[index]?.productId?.message ||
            form.formState.errors.items?.[index]?.variantId?.message) && (
            <p className="text-sm font-medium text-destructive">
              {form.formState.errors.items?.[index]?.productId?.message ||
                form.formState.errors.items?.[index]?.variantId?.message}
            </p>
          )}
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
                <Input type="number" min="1" {...field} />
              </FormControl>
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
