import { useState } from "react";
import { Link, Redirect, useRoute } from "wouter";
import { useGetProduct, useListProductVariants } from "@/api-client";
import { useAuth } from "@/lib/auth";
import { isPartnerPortalUser } from "@/lib/partner";
import { partnerBackHref } from "@/lib/partner-routes";
import { resolvedProductImageUrl } from "@/lib/product-image-url";
import { productImageList, variantImageList } from "@/lib/image-urls";
import { formatInr } from "@/lib/format-currency";
import { jsonToAttrs, attributesPlainLine, AttrTags } from "@/pages/products-shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, ImageIcon, Package } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PartnerProductDetailPage() {
  const { user } = useAuth();
  const [, params] = useRoute("/products/:id");
  const productId = params?.id ? parseInt(params.id, 10) : NaN;

  const returnPoId = (() => {
    if (typeof window === "undefined") return undefined;
    const q = new URLSearchParams(window.location.search);
    const from = q.get("fromPo");
    return from && /^\d+$/.test(from) ? parseInt(from, 10) : undefined;
  })();

  const { data: product, isLoading, isError } = useGetProduct(productId, {
    query: { enabled: Number.isFinite(productId) && productId > 0 },
  });

  const { data: variantsData } = useListProductVariants(productId, {
    query: { enabled: Number.isFinite(productId) && productId > 0 },
  });

  const variantList = variantsData?.data ?? [];
  const isSingleSku = !!(product as { isSingleSku?: boolean } | undefined)?.isSingleSku;
  const [activeImage, setActiveImage] = useState(0);

  if (!user || !isPartnerPortalUser(user)) {
    return <Redirect to="/dashboard" />;
  }

  if (!Number.isFinite(productId) || productId <= 0) {
    return <Redirect to="/purchase-orders" />;
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
      <div className="space-y-4 max-w-lg mx-auto text-center py-16">
        <p className="text-muted-foreground">Product not found or not available.</p>
        <Button variant="outline" asChild>
          <Link href={partnerBackHref(user, "product", returnPoId)}>Back to order</Link>
        </Button>
      </div>
    );
  }

  const images = productImageList(product as { imageUrls?: string | string[] | null; imageUrl?: string | null });
  const resolved = images.map((u) => resolvedProductImageUrl(u)).filter(Boolean) as string[];
  const current = resolved[activeImage] ?? resolved[0];
  const categoryLine = product.categoryPath || product.category?.name || "";
  const descriptionText = product.description?.trim() ?? "";

  return (
    <div className="space-y-6 max-w-5xl animate-in fade-in duration-300">
      <div className="flex items-start gap-3">
        <Link href={partnerBackHref(user, "product", returnPoId)}>
          <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Product specification</p>
          <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
            <span className="font-mono">{product.sku}</span>
            {categoryLine ? (
              <>
                <span>·</span>
                <span>{categoryLine}</span>
              </>
            ) : null}
            <Badge variant="secondary" className="font-normal">
              Reference only
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5 space-y-4">
          <Card className="overflow-hidden">
            <CardContent className="p-3">
              {current ? (
                <div className="aspect-square rounded-xl bg-muted/20 flex items-center justify-center overflow-hidden">
                  <img src={current} alt="" className="max-h-full max-w-full object-contain p-2" />
                </div>
              ) : (
                <div className="aspect-square rounded-xl bg-muted/30 flex flex-col items-center justify-center text-muted-foreground">
                  <ImageIcon className="h-10 w-10 opacity-40" />
                  <p className="text-sm mt-2">No image</p>
                </div>
              )}
              {resolved.length > 1 ? (
                <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                  {resolved.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setActiveImage(i)}
                      className={cn(
                        "h-14 w-14 shrink-0 rounded-lg border overflow-hidden",
                        i === activeImage && "ring-2 ring-primary",
                      )}
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Base price</span>
                <span className="font-semibold tabular-nums">{formatInr(Number(product.price))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST</span>
                <span className="tabular-nums">{Number(product.gstPercent).toFixed(2)}%</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              {descriptionText ? (
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{descriptionText}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No description provided.</p>
              )}
            </CardContent>
          </Card>

          {isSingleSku ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Attributes</CardTitle>
              </CardHeader>
              <CardContent>
                {jsonToAttrs((product as { attributes?: string | null }).attributes).length > 0 ? (
                  <AttrTags json={(product as { attributes?: string | null }).attributes} />
                ) : (
                  <p className="text-sm text-muted-foreground">No attribute tags.</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  Variants ({variantList.length})
                </CardTitle>
                <CardDescription>Size, colour, fabric and other options for this catalog product</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {variantList.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg">
                    No variants defined.
                  </p>
                ) : (
                  <div className="rounded-xl border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead>Variant</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Specs</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {variantList.map((v) => {
                          const photos = variantImageList(v);
                          const thumb = resolvedProductImageUrl(photos[0] ?? null);
                          return (
                            <TableRow key={v.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {thumb ? (
                                    <img src={thumb} alt="" className="h-9 w-9 rounded-md object-cover border" />
                                  ) : null}
                                  <span className="font-medium text-sm">{v.name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">{v.sku}</TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                                {attributesPlainLine(v.attributes) || "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-sm">
                                {formatInr(v.price != null ? Number(v.price) : Number(product.price))}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
