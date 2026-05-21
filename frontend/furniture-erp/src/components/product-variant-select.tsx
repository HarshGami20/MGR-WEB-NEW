import { useMemo, useState } from "react";
import { useListProductVariants } from "@/api-client";
import type { Product } from "@/api-client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  products: Product[];
  productId: number;
  variantId?: number | null;
  onProductChange: (productId: number) => void;
  onVariantChange: (variantId: number | null) => void;
  onPriceChange: (price: number) => void;
};

export default function ProductVariantSelect({
  products,
  productId,
  variantId,
  onProductChange,
  onVariantChange,
  onPriceChange,
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

  return (
    <div className="w-full min-w-0 max-w-full space-y-3 overflow-hidden">
      <div className="space-y-2 min-w-0 max-w-full">
        <label className="text-sm font-medium leading-none">Product</label>
        <div className="min-w-0 max-w-full">
          <Popover open={open} onOpenChange={setOpen} modal={false}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                title={selectedProduct ? selectedProductLabel : undefined}
                className="h-auto min-h-10 w-full min-w-0 max-w-full justify-between gap-2 py-2 font-normal"
              >
                <span className="min-w-0 flex-1 truncate text-left">{selectedProductLabel}</span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="z-[100] w-[var(--radix-popover-trigger-width)] max-w-[min(100vw-2rem,420px)] p-0 pointer-events-auto overflow-hidden"
              align="start"
              collisionPadding={12}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <Command className="max-h-[min(320px,50vh)] overflow-hidden">
                <CommandInput placeholder="Search product by name or SKU..." />
                <CommandList
                  className="max-h-[min(280px,45vh)] overflow-x-hidden overflow-y-auto overscroll-contain"
                  onWheel={(e) => e.stopPropagation()}
                >
                  <CommandEmpty>No product found.</CommandEmpty>
                  <CommandGroup className="overflow-hidden p-1">
                    {products.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={`${p.name} ${p.sku}`}
                        keywords={[p.name, p.sku, String(p.id)]}
                        title={`${p.name} (${p.sku})`}
                        className="min-w-0 max-w-full overflow-hidden"
                        onSelect={() => applyProduct(p.id)}
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <Check className={cn("mr-2 h-4 w-4 shrink-0", Number(productId) === p.id ? "opacity-100" : "opacity-0")} />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div className="truncate">{p.name}</div>
                          <div className="truncate text-xs text-muted-foreground font-mono">{p.sku}</div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {hasVariants ? (
        <div className="space-y-2 min-w-0 max-w-full">
          <label className="text-sm font-medium leading-none">Variant</label>
          <Select
            value={variantId != null ? String(variantId) : ""}
            onValueChange={(val) => applyVariant(val ? parseInt(val, 10) : null)}
          >
            <SelectTrigger className="w-full min-w-0 max-w-full">
              <SelectValue
                className="truncate"
                placeholder={variantsLoading ? "Loading variants..." : "Select variant"}
              />
            </SelectTrigger>
            <SelectContent className="max-w-[min(100vw-2rem,420px)]">
              {variants.map((v: any) => (
                <SelectItem key={v.id} value={String(v.id)} className="min-w-0">
                  <span className="block truncate">
                    {v.name} ({v.sku}) · ₹{Number(v.price ?? selectedProduct?.price ?? 0).toLocaleString("en-IN")}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}

