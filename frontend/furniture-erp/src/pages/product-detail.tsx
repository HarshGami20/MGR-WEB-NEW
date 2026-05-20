import { useState, type ComponentType, type ReactNode } from "react";
import { Link, Redirect, useRoute, useLocation } from "wouter";
import {
  useGetProduct,
  useDeleteProduct,
  useListProductVariants,
  useDeleteProductVariant,
  getListProductsQueryKey,
  getGetProductQueryKey,
  getListProductVariantsQueryKey,
  type ProductVariant,
} from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  AlignLeft,
  ArrowLeft,
  BadgeCheck,
  ChevronDown,
  Edit,
  Hexagon,
  ImageIcon,
  LayoutGrid,
  MoreVertical,
  Plus,
  Star,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermissions } from "@/lib/permissions";
import { VariantFormDialog, attributesPlainLine, AttrTags, jsonToAttrs } from "@/pages/products-shared";
import { cn } from "@/lib/utils";
import { resolvedProductImageUrl } from "@/lib/product-image-url";
import { productImageList, variantImageList } from "@/lib/image-urls";
import { formatInr } from "@/lib/format-currency";

function formatVariantPrice(v: { price?: number | null }, basePrice: number): string {
  const amount = v.price != null ? Number(v.price) : Number(basePrice);
  return formatInr(amount);
}

function formatPriceCompact(amount: number): string {
  if (amount >= 1000) {
    const k = amount / 1000;
    return k % 1 === 0 ? `₹${k}k` : `₹${k.toFixed(1)}k`;
  }
  return formatInr(amount);
}

function formatPriceRange(basePrice: number, variants: ProductVariant[]): string {
  const prices =
    variants.length > 0
      ? variants.map((v) => (v.price != null ? Number(v.price) : Number(basePrice)))
      : [Number(basePrice)];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return formatPriceCompact(min);
  return `${formatPriceCompact(min)} - ${formatPriceCompact(max)}`;
}

function DetailCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border/60 bg-white shadow-sm", className)}>{children}</div>
  );
}

function StatInfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className="text-sm font-semibold text-foreground text-right tabular-nums">{value}</span>
    </div>
  );
}

function ActiveStatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium",
        active ? "text-green-700" : "text-muted-foreground",
      )}
    >
      <span
        className={cn("h-2 w-2 rounded-full", active ? "bg-green-600" : "bg-muted-foreground/50")}
        aria-hidden
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function ProductDetailGallery({ urls, editHref, canEdit }: { urls: string[]; editHref?: string; canEdit?: boolean }) {
  const resolved = urls.map((u) => resolvedProductImageUrl(u)).filter(Boolean) as string[];
  const [active, setActive] = useState(0);
  const current = resolved[active] ?? resolved[0];

  if (resolved.length === 0) {
    return (
      <DetailCard className="p-4">
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl bg-muted/15 text-muted-foreground">
          <ImageIcon className="h-10 w-10 opacity-40" aria-hidden />
          <p className="text-sm">No photos yet</p>
          {canEdit && editHref ? (
            <Link href={editHref}>
              <Button type="button" variant="outline" size="sm" className="rounded-lg">
                Add photos
              </Button>
            </Link>
          ) : null}
        </div>
      </DetailCard>
    );
  }

  return (
    <DetailCard className="overflow-hidden p-3">
      <div className="overflow-hidden rounded-xl bg-muted/15">
        <div className="flex aspect-[4/3] items-center justify-center">
          {current ? (
            <img src={current} alt="" className="h-full w-full object-contain p-2" loading="lazy" />
          ) : null}
        </div>
        {resolved.length > 1 ? (
          <div className="flex justify-center gap-1.5 py-2.5">
            {resolved.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === active ? "w-5 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground/40",
                )}
                aria-label={`Photo ${i + 1}`}
              />
            ))}
          </div>
        ) : null}
      </div>
      {resolved.length > 1 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5">
          {resolved.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-colors",
                i === active ? "border-primary ring-1 ring-primary/30" : "border-border/60 opacity-85 hover:opacity-100",
              )}
            >
              <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </DetailCard>
  );
}

export default function ProductDetail() {
  const [, params] = useRoute("/products/:id");
  const [, setLocation] = useLocation();
  const productId = params?.id ? parseInt(params.id, 10) : NaN;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { can } = usePermissions();

  const [variantDialogOpen, setVariantDialogOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const { data: product, isLoading, isError } = useGetProduct(productId, {
    query: { enabled: Number.isFinite(productId) && productId > 0 },
  });

  const hasVariantsProduct = (product?.variantCount ?? 0) > 0;

  const { data: variants, isLoading: variantsLoading } = useListProductVariants(productId, {
    query: {
      enabled: Number.isFinite(productId) && productId > 0 && hasVariantsProduct,
    },
  });

  const variantList: ProductVariant[] = Array.isArray(variants) ? variants : [];
  const variationCount = product?.variantCount ?? variantList.length;
  const isSingleSku = !hasVariantsProduct;

  const deleteProduct = useDeleteProduct({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        toast({ title: "Product deleted" });
        setLocation("/products");
      },
      onError: (e: { data?: { error?: string }; message?: string }) =>
        toast({
          title: "Delete failed",
          description: e?.data?.error ?? e?.message,
          variant: "destructive",
        }),
    },
  });

  const deleteVariant = useDeleteProductVariant({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductVariantsQueryKey(productId) });
        queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(productId) });
        toast({ title: "Variant deleted" });
      },
    },
  });

  const handleDeleteProduct = () => {
    if (confirm("Delete this product and all its variants?")) {
      deleteProduct.mutate({ id: productId });
    }
  };

  if (!Number.isFinite(productId) || productId <= 0) {
    return <Redirect to="/products" />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Loading product…
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Product not found.</p>
        <Link href="/products">
          <Button variant="outline">Back to products</Button>
        </Link>
      </div>
    );
  }

  const canEdit = can("products", "edit");
  const canDelete = can("products", "delete");
  const categoryLine = product.categoryPath || product.category?.name || "";
  const productImages = productImageList(product as { imageUrls?: string | string[] | null; imageUrl?: string | null });
  const basePrice = Number(product.price);
  const priceRangeLabel = formatPriceRange(basePrice, variantList);
  const productActive = isSingleSku
    ? true
    : variantList.length === 0
      ? true
      : variantList.some((v) => v.isActive);
  const descriptionText = product.description?.trim() ?? "";
  const descriptionLong = descriptionText.length > 220;

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-[hsl(0_0%_97%)] -mx-4 -mt-4 px-4 py-6 md:-mx-8 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Link href="/products">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-1 shrink-0 rounded-full"
              aria-label="Back to products"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground md:text-[1.75rem]">
              {product.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {categoryLine ? <span>{categoryLine}</span> : null}
              {categoryLine ? <span className="text-muted-foreground/50">•</span> : null}
              <ActiveStatusBadge active={productActive} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canEdit && (
              <Link href={`/products/${productId}/edit`}>
                <Button type="button" className="rounded-xl gap-2 shadow-sm">
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
              </Link>
            )}
            {canDelete && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="rounded-xl border-border/80"
                    aria-label="More actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDeleteProduct}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete product
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          {/* Left column */}
          <div className="space-y-4 lg:col-span-4">
            <ProductDetailGallery
              urls={productImages}
              editHref={`/products/${productId}/edit`}
              canEdit={canEdit}
            />

            <DetailCard className="px-4 py-1">
              <div className="grid grid-cols-2 divide-x divide-border/60 border-b border-border/60">
                <div className="py-4 text-center">
                  <p className="text-2xl font-bold tabular-nums leading-none">{product.stockQty}</p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Total units
                  </p>
                </div>
                <div className="py-4 text-center">
                  <p className="text-2xl font-bold tabular-nums leading-none">
                    {isSingleSku ? "—" : variationCount}
                  </p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Variations
                  </p>
                </div>
              </div>
              <div className="px-1 pb-2">
                <StatInfoRow
                  icon={TrendingUp}
                  label="GST Rate"
                  value={`${Number(product.gstPercent).toFixed(2)}%`}
                />
                <StatInfoRow icon={BadgeCheck} label="Base SKU" value={product.sku} />
                <StatInfoRow icon={LayoutGrid} label="Category" value={categoryLine || "—"} />
                <StatInfoRow icon={Star} label="Price Range" value={priceRangeLabel} />
              </div>
            </DetailCard>
          </div>

          {/* Right column */}
          <div className="space-y-6 lg:col-span-8">
            <DetailCard className="p-5 md:p-6">
              <div className="flex items-center gap-2 mb-3">
                <AlignLeft className="h-4 w-4 text-muted-foreground" aria-hidden />
                <h2 className="font-serif text-lg font-semibold text-foreground">Description</h2>
              </div>
              {descriptionText ? (
                <>
                  <p
                    className={cn(
                      "text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap",
                      !descriptionExpanded && descriptionLong && "line-clamp-4",
                    )}
                  >
                    {descriptionText}
                  </p>
                  {descriptionLong ? (
                    <button
                      type="button"
                      onClick={() => setDescriptionExpanded((v) => !v)}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      {descriptionExpanded ? "Show less" : "Show more"}
                      <ChevronDown
                        className={cn("h-4 w-4 transition-transform", descriptionExpanded && "rotate-180")}
                      />
                    </button>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground/80 italic">
                  No description yet. Add one when editing the product.
                </p>
              )}
            </DetailCard>

            {isSingleSku ? (
              <DetailCard className="p-5 md:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Hexagon className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <h2 className="font-serif text-lg font-semibold text-foreground">Variables</h2>
                </div>
                {jsonToAttrs((product as { attributes?: string | null }).attributes).length > 0 ? (
                  <AttrTags json={(product as { attributes?: string | null }).attributes} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No variables yet.
                    {canEdit ? (
                      <>
                        {" "}
                        <Link
                          href={`/products/${productId}/edit`}
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          Add size, colour, fabric…
                        </Link>
                      </>
                    ) : null}
                  </p>
                )}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-border/60">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stock</p>
                    <p
                      className={cn(
                        "mt-1 text-lg font-bold tabular-nums",
                        product.stockQty <= (product.lowStockThreshold ?? 10) && product.stockQty > 0
                          ? "text-amber-600"
                          : product.stockQty === 0
                            ? "text-destructive"
                            : "text-foreground",
                      )}
                    >
                      {product.stockQty}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Low at</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-muted-foreground">
                      ≤{product.lowStockThreshold ?? 10}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Price</p>
                    <p className="mt-1 text-lg font-bold tabular-nums">{formatInr(basePrice)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
                    <div className="mt-1">
                      <ActiveStatusBadge active={productActive} />
                    </div>
                  </div>
                </div>
              </DetailCard>
            ) : (
              <DetailCard className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4 md:px-6">
                  <div className="flex items-center gap-2">
                    <Hexagon className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <h2 className="font-serif text-lg font-semibold text-foreground">Variations</h2>
                    <Badge variant="secondary" className="rounded-md font-normal tabular-nums">
                      {variationCount}
                    </Badge>
                  </div>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl border-dashed border-primary text-primary hover:bg-primary/5 gap-1.5"
                      onClick={() => {
                        setEditingVariant(null);
                        setVariantDialogOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Add variation
                    </Button>
                  )}
                </div>

                {variantsLoading ? (
                  <p className="text-center text-sm text-muted-foreground py-12">Loading variations…</p>
                ) : variantList.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-12 px-4">
                    No variations yet. Use Add variation to create colors, sizes, or options.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/60 hover:bg-transparent bg-muted/25">
                        <TableHead className="w-[72px] px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                          Photo
                        </TableHead>
                        <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                          Variation &amp; SKU
                        </TableHead>
                        <TableHead className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                          Stock
                        </TableHead>
                        <TableHead className="hidden sm:table-cell px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                          Low at
                        </TableHead>
                        <TableHead className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                          Price
                        </TableHead>
                        <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                          Status
                        </TableHead>
                        {(canEdit || canDelete) && (
                          <TableHead className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground w-[100px]">
                            Actions
                          </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {variantList.map((v) => {
                        const attrLine = attributesPlainLine(v.attributes);
                        const inactive = !v.isActive;
                        const low = v.lowStockThreshold ?? 10;
                        const isLowStock = v.stockQty <= low;
                        const vPhotos = variantImageList(
                          v as { imageUrls?: string | string[] | null; imageUrl?: string | null },
                        );
                        const thumb = vPhotos[0] ? resolvedProductImageUrl(vPhotos[0]) : null;

                        return (
                          <TableRow key={v.id} className={cn("border-border/60", inactive && "opacity-55")}>
                            <TableCell className="px-3 py-3 align-middle">
                              {thumb ? (
                                <div className="h-11 w-11 overflow-hidden rounded-lg border border-border/60 bg-muted/30">
                                  <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                                </div>
                              ) : (
                                <div className="h-11 w-11 rounded-lg border border-border/60 bg-muted/30" />
                              )}
                            </TableCell>
                            <TableCell className="px-4 py-3 align-top max-w-[min(300px,45vw)]">
                              <p className="font-semibold text-foreground leading-snug">{v.name}</p>
                              <p className="mt-0.5 font-mono text-xs text-muted-foreground">{v.sku}</p>
                              {attrLine ? (
                                <p className="mt-1 text-xs text-muted-foreground leading-snug">{attrLine}</p>
                              ) : null}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "px-4 py-3 text-right align-top tabular-nums font-semibold",
                                isLowStock && "text-destructive",
                              )}
                            >
                              {v.stockQty}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell px-4 py-3 text-right align-top tabular-nums text-muted-foreground text-sm">
                              {low > 0 ? `≤ ${low}` : "—"}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right align-top tabular-nums font-semibold">
                              {formatVariantPrice(v, basePrice)}
                            </TableCell>
                            <TableCell className="px-4 py-3 align-top">
                              <ActiveStatusBadge active={!inactive} />
                            </TableCell>
                            {(canEdit || canDelete) && (
                              <TableCell className="px-4 py-3 text-right align-top">
                                <div className="inline-flex items-center justify-end gap-1">
                                  {canEdit && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      className="h-8 w-8 rounded-lg"
                                      aria-label={`Edit ${v.name}`}
                                      onClick={() => {
                                        setEditingVariant(v);
                                        setVariantDialogOpen(true);
                                      }}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {canDelete && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      aria-label={`Delete ${v.name}`}
                                      onClick={() => {
                                        if (confirm(`Delete variation "${v.name}"?`)) {
                                          deleteVariant.mutate({ productId, variantId: v.id });
                                        }
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </DetailCard>
            )}
          </div>
        </div>
      </div>

      {!isSingleSku ? (
        <VariantFormDialog
          key={`${productId}-${editingVariant?.id ?? "new"}-${variantDialogOpen}`}
          open={variantDialogOpen}
          onClose={() => {
            setVariantDialogOpen(false);
            setEditingVariant(null);
          }}
          productId={productId}
          editingVariant={editingVariant}
          parentSku={product.sku}
        />
      ) : null}
    </div>
  );
}
