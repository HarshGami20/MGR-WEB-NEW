import { useMemo, useState } from "react";
import { useListProductVariants } from "@/api-client";
import type { Product } from "@/api-client";
import { StockBadge } from "@/components/stock-badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  catalogVariantStock,
  stockStatusFromQty,
  type BranchStock,
  type CatalogVariantRow,
} from "@/lib/product-branch-stock";

/** Fits inside inventory dialog (425px) and order forms; long labels ellipsis. */
const PICKER_MAX_W_CLASS = "w-full max-w-[360px]";

type ProductWithStock = Product & {
  branchStocks?: BranchStock[];
  variants?: CatalogVariantRow[];
};

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
  /** Branch for stock display and out-of-stock checks (sales orders). */
  branchId?: number | null;
  /** When true with branchId, show stock and block out-of-stock catalog picks. */
  enforceStockCheck?: boolean;
};

export default function ProductVariantSelect({
  products,
  productId,
  variantId,
  onProductChange,
  onVariantChange,
  onPriceChange,
  layout = "stacked",
  branchId = null,
  enforceStockCheck = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [variantOpen, setVariantOpen] = useState(false);
  const { data: variantsData, isLoading: variantsLoading } = useListProductVariants(
    productId > 0 ? productId : (undefined as any),
    { query: { enabled: productId > 0 } },
  );
  const variants = (variantsData ?? []) as CatalogVariantRow[];
  const hasVariants = variants.length > 0;
  const stockActive = enforceStockCheck && branchId != null;

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === Number(productId)) as ProductWithStock | undefined,
    [products, productId],
  );

  const productStockQty = useMemo(() => {
    if (!stockActive || !selectedProduct || hasVariants) return undefined;
    return catalogVariantStock(selectedProduct, null, branchId);
  }, [stockActive, selectedProduct, hasVariants, branchId]);

  const applyProduct = (nextProductId: number) => {
    const p = products.find((it) => it.id === nextProductId) as ProductWithStock | undefined;
    const singleSku = (p?.variantCount ?? 0) === 0;
    if (stockActive && p && singleSku) {
      const qty = catalogVariantStock(p, null, branchId);
      if (qty !== undefined && qty <= 0) return;
    }
    onProductChange(nextProductId);
    onVariantChange(null);
    onPriceChange(Number(p?.price ?? 0));
    setOpen(false);
  };

  const applyVariant = (nextVariantId: number | null) => {
    if (stockActive && selectedProduct && nextVariantId) {
      const selectedVariant = variants.find((v) => v.id === nextVariantId);
      const qty = catalogVariantStock(selectedProduct, selectedVariant ?? null, branchId);
      if (qty !== undefined && qty <= 0) return;
    }
    onVariantChange(nextVariantId);
    if (!nextVariantId) {
      onPriceChange(Number(selectedProduct?.price ?? 0));
      return;
    }
    const selectedVariant = variants.find((v) => v.id === nextVariantId);
    onPriceChange(Number(selectedVariant?.price ?? selectedProduct?.price ?? 0));
    setVariantOpen(false);
  };

  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === variantId) ?? null,
    [variants, variantId],
  );

  const selectedProductLabel = selectedProduct
    ? `${selectedProduct.name} (${selectedProduct.sku})`
    : "Select product";

  const selectedVariantLabel = variantsLoading
    ? "Loading variants..."
    : selectedVariant?.name ?? "Select variant";

  const isInline = layout === "inline";
  const fieldWidth = isInline ? "w-full" : PICKER_MAX_W_CLASS;

  return (
    <div className={cn(isInline ? "w-full min-w-0" : PICKER_MAX_W_CLASS, "min-w-0 overflow-hidden")}>
      {enforceStockCheck && branchId == null ? (
        <p className="mb-2 text-xs text-muted-foreground">
          Select a branch in the header to view stock and add catalog items.
        </p>
      ) : null}
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
                    const row = p as ProductWithStock;
                    const rowTitle = `${p.name} (${p.sku})`;
                    const hasVariants = (row.variantCount ?? 0) > 0;
                    const singleSku = !hasVariants;
                    const qty =
                      stockActive && singleSku
                        ? catalogVariantStock(row, null, branchId)
                        : undefined;
                    const outOfStock = stockActive && singleSku && qty !== undefined && qty <= 0;
                    const threshold = row.lowStockThreshold ?? 10;
                    const status =
                      qty !== undefined ? stockStatusFromQty(qty, threshold) : undefined;
                    return (
                      <CommandItem
                        key={p.id}
                        value={`${p.name} ${p.sku}`}
                        keywords={[p.name, p.sku, String(p.id)]}
                        title={rowTitle}
                        disabled={outOfStock}
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
                          <div className="flex min-w-0 items-center gap-1.5">
                            {hasVariants ? (
                              <Layers
                                className="h-3.5 w-3.5 shrink-0 text-primary"
                                aria-hidden
                                aria-label="Has variants"
                              />
                            ) : null}
                            <EllipsisText className="flex-1">{p.name}</EllipsisText>
                          </div>
                          <EllipsisText className="text-xs text-muted-foreground font-mono">{p.sku}</EllipsisText>
                        </div>
                        {status ? <StockBadge status={status} qty={qty} /> : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {stockActive && productStockQty !== undefined && !hasVariants ? (
          <div className="flex justify-end">
            <StockBadge
              status={stockStatusFromQty(productStockQty, selectedProduct?.lowStockThreshold ?? 10)}
              qty={productStockQty}
            />
          </div>
        ) : null}
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
          <Popover open={variantOpen} onOpenChange={setVariantOpen} modal={false}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={variantOpen}
                disabled={variantsLoading}
                className={cn(
                  fieldWidth,
                  "h-auto min-h-10 min-w-0 overflow-hidden py-2 pl-3 pr-2 font-normal mb-0.5",
                  "flex items-center justify-between gap-2",
                )}
              >
                <EllipsisText className="flex-1 text-left">{selectedVariantLabel}</EllipsisText>
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
                <CommandInput placeholder="Search variant..." className="w-full" />
                <CommandList
                  className="max-h-[min(260px,40vh)] w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-contain"
                  onWheel={(e) => e.stopPropagation()}
                >
                  <CommandEmpty>No variant found.</CommandEmpty>
                  <CommandGroup className="w-full min-w-0 max-w-full overflow-hidden p-1">
                    {variants.map((v) => {
                      const variantName = v.name ?? "Variant";
                      const variantSku = v.sku ?? "";
                      const rowTitle = variantSku ? `${variantName} (${variantSku})` : variantName;
                      const qty = stockActive
                        ? catalogVariantStock(selectedProduct ?? {}, v, branchId)
                        : undefined;
                      const outOfStock = stockActive && qty !== undefined && qty <= 0;
                      const threshold = v.lowStockThreshold ?? selectedProduct?.lowStockThreshold ?? 10;
                      const status = qty !== undefined ? stockStatusFromQty(qty, threshold) : undefined;
                      return (
                        <CommandItem
                          key={v.id}
                          value={`${variantName} ${variantSku}`}
                          keywords={[variantName, variantSku, String(v.id)]}
                          title={rowTitle}
                          disabled={outOfStock}
                          className="flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden px-2"
                          onSelect={() => applyVariant(v.id)}
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          <Check
                            className={cn(
                              "h-4 w-4 shrink-0",
                              variantId === v.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <EllipsisText>{variantName}</EllipsisText>
                            {variantSku ? (
                              <EllipsisText className="text-xs text-muted-foreground font-mono">{variantSku}</EllipsisText>
                            ) : null}
                          </div>
                          {status ? <StockBadge status={status} qty={qty} /> : null}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      ) : null}
      </div>
    </div>
  );
}
