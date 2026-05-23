import { useMemo, useState } from "react";
import { useListProductVariants } from "@/api-client";
import type { Product } from "@/api-client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInr } from "@/lib/format-currency";

/** Fits inside inventory dialog (425px) and order forms; long labels ellipsis. */
const PICKER_MAX_W_CLASS = "w-full max-w-[360px]";

function EllipsisText({
  children,
  className,
  title,
}: {
  children: string;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title ?? children}
      className={cn("block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap", className)}
    >
      {children}
    </span>
  );
}

type Props = {
  products: Product[];
  productId: number;
  variantId?: number | null;
  onProductChange: (productId: number) => void;
  onVariantChange: (variantId: number | null) => void;
  onPriceChange: (price: number) => void;
  /** `inline` = product and variant side by side (e.g. order line items). Default stacks vertically. */
  layout?: "stacked" | "inline";
};

export default function ProductVariantSelect({
  products,
  productId,
  variantId,
  onProductChange,
  onVariantChange,
  onPriceChange,
  layout = "stacked",
}: Props) {
  const [open, setOpen] = useState(false);
  const { data: variantsData, isLoading: variantsLoading } = useListProductVariants(
    productId > 0 ? productId : (undefined as any),
    { query: { enabled: productId > 0 } },
  );
  const variants = variantsData ?? [];
  const hasVariants = variants.length > 0;

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === Number(productId)),
    [products, productId],
  );

  const applyProduct = (nextProductId: number) => {
    onProductChange(nextProductId);
    onVariantChange(null);
    const p = products.find((it) => it.id === nextProductId);
    onPriceChange(Number(p?.price ?? 0));
    setOpen(false);
  };

  const applyVariant = (nextVariantId: number | null) => {
    onVariantChange(nextVariantId);
    if (!nextVariantId) {
      onPriceChange(Number(selectedProduct?.price ?? 0));
      return;
    }
    const selectedVariant = variants.find((v) => v.id === nextVariantId);
    onPriceChange(Number(selectedVariant?.price ?? selectedProduct?.price ?? 0));
  };

  const selectedProductLabel = selectedProduct
    ? `${selectedProduct.name} (${selectedProduct.sku})`
    : "Select product";

  const isInline = layout === "inline";
  const fieldWidth = isInline ? "w-full" : PICKER_MAX_W_CLASS;

  return (
    <div className={cn(isInline ? "w-full min-w-0" : PICKER_MAX_W_CLASS, "min-w-0 overflow-hidden")}>
      <div
        className={cn(
          isInline && hasVariants
            ? "grid grid-cols-1 sm:grid-cols-2 gap-3 items-end"
            : isInline
              ? "w-full"
              : "space-y-2 min-w-0 overflow-hidden",
        )}
      >
        <div className="space-y-2 min-w-0 overflow-hidden">
        <label className="text-sm font-medium leading-none">Product</label>
        <Popover open={open} onOpenChange={setOpen} modal={false}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn(
                fieldWidth,
                "h-auto min-h-10 min-w-0 overflow-hidden py-2 pl-3 pr-2 font-normal",
                "flex items-center justify-between gap-2",
              )}
            >
              <EllipsisText className="flex-1 text-left">{selectedProductLabel}</EllipsisText>
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className={cn(
              fieldWidth,
              "z-[100] min-w-0 p-0 overflow-hidden",
              isInline ? "max-w-[min(480px,calc(100vw-2rem))]" : "max-w-[min(360px,calc(100vw-2rem))]",
            )}
            align="start"
            sideOffset={4}
            collisionPadding={16}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command className="w-full min-w-0 max-w-full overflow-hidden">
              <CommandInput placeholder="Search product by name or SKU..." className="w-full" />
              <CommandList
                className="max-h-[min(260px,40vh)] w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-contain"
                onWheel={(e) => e.stopPropagation()}
              >
                <CommandEmpty>No product found.</CommandEmpty>
                <CommandGroup className="w-full min-w-0 max-w-full overflow-hidden p-1">
                  {products.map((p) => {
                    const rowTitle = `${p.name} (${p.sku})`;
                    return (
                      <CommandItem
                        key={p.id}
                        value={`${p.name} ${p.sku}`}
                        keywords={[p.name, p.sku, String(p.id)]}
                        title={rowTitle}
                        className="flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden px-2"
                        onSelect={() => applyProduct(p.id)}
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <Check
                          className={cn(
                            "h-4 w-4 shrink-0",
                            Number(productId) === p.id ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <EllipsisText>{p.name}</EllipsisText>
                          <EllipsisText className="text-xs text-muted-foreground font-mono">{p.sku}</EllipsisText>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        </div>

      {hasVariants ? (
        <div
          className={cn(
            "space-y-2 min-w-0 overflow-hidden",
            !isInline && cn("mt-3", PICKER_MAX_W_CLASS),
            isInline && fieldWidth,
          )}
        >
          <label className="text-sm font-medium leading-none">Variant</label>
          <Select
            value={variantId != null ? String(variantId) : ""}
            onValueChange={(val) => applyVariant(val ? parseInt(val, 10) : null)}
          >
            <SelectTrigger className={cn(fieldWidth, "min-w-0 overflow-hidden mb-0.5 [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate")}>
              <SelectValue placeholder={variantsLoading ? "Loading variants..." : "Select variant"} />
            </SelectTrigger>
            <SelectContent className={cn(fieldWidth, isInline ? "max-w-[min(480px,calc(100vw-2rem))]" : "max-w-[min(360px,calc(100vw-2rem))]")}>
              {variants.map((v) => {
                const label = `${v.name} (${v.sku}) · ${formatInr(Number(v.price ?? selectedProduct?.price ?? 0))}`;
                return (
                  <SelectItem key={v.id} value={String(v.id)} title={label} className="min-w-0 max-w-full">
                    <EllipsisText>{label}</EllipsisText>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      </div>
    </div>
  );
}
