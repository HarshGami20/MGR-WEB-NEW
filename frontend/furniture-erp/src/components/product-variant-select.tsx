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

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="text-sm font-medium leading-none">Product</label>
        <div>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
                {selectedProduct ? `${selectedProduct.name} (${selectedProduct.sku})` : "Select product"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[420px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search product by name or SKU..." />
                <CommandList>
                  <CommandEmpty>No product found.</CommandEmpty>
                  <CommandGroup>
                    {products.map((p) => (
                      <CommandItem key={p.id} value={`${p.name} ${p.sku}`} onSelect={() => applyProduct(p.id)}>
                        <Check className={cn("mr-2 h-4 w-4", Number(productId) === p.id ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">{p.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground font-mono">{p.sku}</span>
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
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">Variant</label>
          <Select
            value={variantId != null ? String(variantId) : ""}
            onValueChange={(val) => applyVariant(val ? parseInt(val, 10) : null)}
          >
            <SelectTrigger>
              <SelectValue placeholder={variantsLoading ? "Loading variants..." : "Select variant"} />
            </SelectTrigger>
            <SelectContent>
              {variants.map((v: any) => (
                <SelectItem key={v.id} value={String(v.id)}>
                  {v.name} ({v.sku}) - Rs {Number(v.price ?? selectedProduct?.price ?? 0)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}

