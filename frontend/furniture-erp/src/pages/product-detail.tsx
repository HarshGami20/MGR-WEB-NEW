  import { useState } from "react";
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
  import { ArrowLeft, Edit, ImageIcon, MoreVertical, Plus, Trash2 } from "lucide-react";
  import { Badge } from "@/components/ui/badge";
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
  import { usePermissions } from "@/lib/permissions";
  import { VariantFormDialog, attributesPlainLine } from "@/pages/products-shared";
  import { cn } from "@/lib/utils";
  import { resolvedProductImageUrl } from "@/lib/product-image-url";

  function formatVariantPrice(v: { price?: number | null }, basePrice: number): string {
    if (v.price != null) return `₹${Number(v.price).toFixed(2)}`;
    return `₹${Number(basePrice).toFixed(2)}`;
  }

  export default function ProductDetail() {
    const [, params] = useRoute("/products/:id");
    const [, setLocation] = useLocation();
    const productId = params?.id ? parseInt(params.id, 10) : NaN;
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { can } = usePermissions();

    const [variantDialogOpen, setVariantDialogOpen] = useState(false);
    const [editingVariant, setEditingVariant] = useState<any | null>(null);

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
        onError: (e: any) =>
          toast({ title: "Delete failed", description: e?.message, variant: "destructive" }),
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
    const productImageSrc = resolvedProductImageUrl(product.imageUrl);

    return (
      <div className="min-h-[calc(100vh-6rem)] bg-[hsl(0_0%_97%)] -mx-4 -mt-4 px-4 py-6 md:-mx-8 md:px-8 md:py-8">
        <div className="mx-auto ">
          {/* Header */}
          <div className="flex items-start gap-3">
            <Link href="/products">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-0.5 shrink-0 rounded-full text-foreground hover:bg-muted"
                aria-label="Back to products"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-[1.65rem]">{product.name}</h1>
              {categoryLine ? (
                <p className="mt-1 text-sm text-muted-foreground">{categoryLine}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {canEdit && (
                <Link href={`/products/${productId}/edit`}>
                  <Button type="button" variant="outline" className="rounded-xl border-border/80 gap-2">
                    <Edit className="h-4 w-4" />
                    Edit
                  </Button>
                </Link>
              )}
              {canDelete && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="icon" className="rounded-xl border-border/80" aria-label="More actions">
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

          {/* Summary stats */}
          <div className="mt-8 rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
            <div
              className={cn(
                "grid divide-x divide-border/60",
                isSingleSku ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4",
              )}
            >
              <div className="px-3 py-5 text-center sm:px-4">
                <p className="text-3xl font-bold tabular-nums text-foreground leading-none">{product.stockQty}</p>
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Total units
                </p>
                {variationCount > 0 ? (
                  <p className="mt-1 text-[10px] text-muted-foreground/90">Sum of variant stock</p>
                ) : null}
              </div>
              {
                isSingleSku && (
                  <div className="px-3 py-5 text-center sm:px-4">
                    <p className="text-3xl font-bold tabular-nums text-foreground leading-none">{product.lowStockThreshold}</p>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Low stock warning
                    </p>
                  </div>
                )
              }
              {isSingleSku ? (
                <div className="px-3 py-5 text-center sm:px-4">
                  <p className="text-3xl font-bold tabular-nums text-foreground leading-none">₹{Number(product.price).toFixed(2)}</p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Price
                  </p>
                </div>
              ) : null}
              {isSingleSku ? (
                <div className="px-3 py-5 text-center sm:px-4">
                  <p className="text-3xl font-bold tabular-nums text-foreground leading-none">{Number(product.gstPercent).toFixed(2)}%</p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    GST
                  </p>
                </div>
              ) : null}
              {!isSingleSku ? (
                <div className="px-3 py-5 text-center sm:px-4">
                  <p className="text-3xl font-bold tabular-nums text-foreground leading-none">{Number(product.gstPercent).toFixed(2)}%</p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    GST
                  </p>
                </div>
              ) : null}
              {!isSingleSku ? (
                <div className="px-3 py-5 text-center sm:px-4">
                  <p className="text-3xl font-bold tabular-nums text-foreground leading-none">{variationCount}</p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Variations
                  </p>
                </div>
              ) : null}
              <div className="px-3 py-5 text-center sm:px-4">
                <p className="text-3xl font-bold tabular-nums text-foreground leading-none font-mono text-[1.35rem] sm:text-3xl">
                  {product.sku}
                </p>
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">SKU</p>
              </div>
            </div>
          </div>

          {/* Description */}
          {product.description ? (
            <p className="mt-5 text-sm text-muted-foreground leading-relaxed">{product.description}</p>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground/70 italic">No description yet. Add one when editing the product.</p>
          )}

          {/* Single SKU: hero photo in place of variations */}
          {isSingleSku ? (
            <section className="mt-8" aria-label="Product image">
              <h2 className="text-lg font-semibold text-foreground mb-3">Photo</h2>
              <div className="overflow-hidden w-fit border border-border/60 bg-white shadow-sm">
                {productImageSrc ? (
                  <img
                    src={productImageSrc}
                    alt=""
                    className="max-h-[min(420px,55vh)] w-auto object-contain bg-muted/20"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-16 px-6 bg-muted/15 text-muted-foreground">
                    <ImageIcon className="h-10 w-10 opacity-40" aria-hidden />
                    <p className="text-sm text-center">No product photo yet.</p>
                    {canEdit ? (
                      <Link href={`/products/${productId}/edit`}>
                        <Button type="button" variant="outline" size="sm" className="rounded-lg mt-1">
                          Add photo when editing
                        </Button>
                      </Link>
                    ) : null}
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {/* Variants only when product has variations */}
          {!isSingleSku ? (
            <>
              <div className="mt-8 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">Variations</h2>
                {canEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl border-border/80 gap-1.5 font-medium"
                    onClick={() => {
                      setEditingVariant(null);
                      setVariantDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                )}
              </div>

              <div className="mt-4">
                {variantsLoading ? (
                  <p className="text-center text-sm text-muted-foreground py-12 rounded-2xl border border-border/60 bg-white shadow-sm">
                    Loading variations…
                  </p>
                ) : variantList.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-12 rounded-2xl border border-dashed border-border/70 bg-white">
                    No variations yet. Use Add to create colors, sizes, or options.
                  </p>
                ) : (
                  <div className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
                    <Table>
                      <TableHeader>
                    <TableRow className="border-border/60 hover:bg-muted/40 bg-muted/30">
                      <TableHead className="w-14 px-2 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Photo
                      </TableHead>
                      <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Variation
                      </TableHead>
                      <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        SKU
                      </TableHead>
                      <TableHead className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Stock
                      </TableHead>
                      <TableHead className="hidden sm:table-cell px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Low at
                      </TableHead>
                      <TableHead className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Price
                      </TableHead>
                      <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground w-[100px]">
                        Status
                      </TableHead>
                      {(canEdit || canDelete) && (
                        <TableHead className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground w-[108px]">
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
                      const isLowStock = v.stockQty <= low && low > 0;
                      return (
                        <TableRow
                          key={v.id}
                          className={cn("border-border/60", inactive && "opacity-55")}
                        >
                          <TableCell className="px-2 py-2 align-middle w-14">
                            <div className="h-12 w-12 overflow-hidden rounded-lg border border-border/60 bg-muted/30">
                              {resolvedProductImageUrl(v.imageUrl) ? (
                                <img
                                  src={resolvedProductImageUrl(v.imageUrl)!}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="h-full w-full" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top max-w-[min(280px,40vw)]">
                            <span className="font-semibold text-foreground">{v.name}</span>
                            {attrLine ? (
                              <p className="mt-1 text-xs text-muted-foreground leading-snug">{attrLine}</p>
                            ) : null}
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top">
                            <Badge variant="secondary" className="rounded-md font-mono text-xs font-normal">
                              {v.sku}
                            </Badge>
                          </TableCell>
                          <TableCell className={cn("px-4 py-3 text-right align-top tabular-nums font-semibold", isLowStock && "text-destructive")}>
                            {v.stockQty}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell px-4 py-3 text-right align-top tabular-nums text-muted-foreground text-sm">
                            {low > 0 ? `≤${low}` : "—"}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right align-top tabular-nums font-medium">
                            {formatVariantPrice(v, product.price)}
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top">
                            {inactive ? (
                              <Badge variant="outline" className="text-muted-foreground font-normal rounded-md">
                                Inactive
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="font-normal rounded-md bg-green-600/12 text-green-700 dark:text-green-400 border-0">
                                Active
                              </Badge>
                            )}
                          </TableCell>
                          {(canEdit || canDelete) && (
                            <TableCell className="px-4 py-3 text-right align-top">
                              <div className="inline-flex items-center justify-end gap-0.5">
                                {canEdit && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
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
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
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
                  </div>
                )}
              </div>
            </>
          ) : null}
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
