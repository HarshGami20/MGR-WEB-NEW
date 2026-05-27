import { useMemo, useState } from "react";
import { Link } from "wouter";
import type { ColumnDef } from "@tanstack/react-table";
import { useListProducts, useDeleteProduct, useGetSettings, getListProductsQueryKey, useListProductVariants } from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Trash2, Edit, Layers, ImageIcon, Eye } from "lucide-react";
import { usePermissions } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { DataTable, DataTablePaginationFooter } from "@/components/data-table";
import { ListCategoryFilter } from "@/components/list-category-filter";
import { formatInr } from "@/lib/format-currency";
import { resolvedProductImageUrl } from "@/lib/product-image-url";
import { productImageList, variantImageList } from "@/lib/image-urls";
import { ListDateRangeFilter } from "@/components/list-date-range-filter";
import { ProductsExportDialog } from "@/components/products-export-dialog";
import { type DateRangeValue, dateRangeToCreatedParams } from "@/lib/list-date-filter";
import { useBranch } from "@/lib/branch-context";

type ProductRow = Record<string, any>;

type BranchStock = {
  branchId: number | null;
  branchName: string;
  stockQty: number;
};

function ProductNameCell({ product }: { product: ProductRow }) {
  const gallery = productImageList(product);
  const hasProductImage = gallery.length > 0;
  const hasVariants = Number(product.variantCount ?? 0) > 0;
  const { data: variantsData } = useListProductVariants(product.id, {
    query: { enabled: !hasProductImage && hasVariants },
  });

  const variantFallback =
    Array.isArray(variantsData) && variantsData.length > 0
      ? resolvedProductImageUrl(variantImageList(variantsData[0] as { imageUrls?: string | string[] | null; imageUrl?: string | null })[0])
      : undefined;
  const imageSrc = resolvedProductImageUrl(gallery[0]) ?? variantFallback;

  return (
    <div className="flex items-start gap-3 min-w-0 max-w-[280px]">
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-border/70 bg-muted/30">
        {imageSrc ? (
          <img src={imageSrc} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageIcon className="h-4 w-4 opacity-60" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <Link href={`/products/${product.id}`}>
          <span className="block truncate font-semibold text-foreground hover:underline" title={String(product.name ?? "")}>
            {product.name}
          </span>
        </Link>
        {product.description ? <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">{product.description}</p> : null}
      </div>
    </div>
  );
}

export default function Products() {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [lowStock, setLowStock] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeValue>({});
  const [page, setPage] = useState(1);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { can } = usePermissions();
  const { selectedBranchId } = useBranch();
  const { data: settingsData } = useGetSettings();
  const defaultGstPercent = settingsData?.defaultGstPercent ?? 18;

  const { data: productsData, isLoading } = useListProducts({
    search: search || undefined,
    categoryId,
    lowStock: lowStock ? true : undefined,
    ...dateRangeToCreatedParams(dateRange),
    page,
    limit: 15,
  });

  const deleteProduct = useDeleteProduct({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        toast({ title: "Product deleted successfully" });
      },
      onError: (e: { data?: { error?: string }; message?: string }) =>
        toast({
          title: "Delete failed",
          description: e?.data?.error ?? e?.message,
          variant: "destructive",
        }),
    },
  });

  const items = (productsData?.data ?? []) as ProductRow[];
  const total = productsData?.total ?? 0;
  const limit = productsData?.limit ?? 15;

  const columns = useMemo<ColumnDef<ProductRow, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        meta: { headerClassName: "w-[280px]", cellClassName: "w-[280px]" },
        cell: ({ row }) => {
          const p = row.original;
          return <ProductNameCell product={p} />;
        },
      },
      {
        accessorKey: "sku",
        header: "SKU",
        meta: {
          cellClassName: "font-mono text-sm text-muted-foreground",
        },
        cell: ({ row }) => <span>{row.original.sku}</span>,
      },
      {
        id: "category",
        header: "Category",
        cell: ({ row }) => (
          <span
            className="block max-w-[180px] truncate text-sm text-muted-foreground"
            title={String(row.original.categoryPath || row.original.category?.name || "—")}
          >
            {row.original.categoryPath || row.original.category?.name || "—"}
          </span>
        ),
      },
      {
        accessorKey: "price",
        header: "Price (₹)",
        meta: { headerClassName: "text-right", cellClassName: "text-right tabular-nums font-medium" },
        cell: ({ row }) => {
          const p = row.original;
          const basePrice = Number(p.price ?? 0);
          const hasVariants = Number(p.variantCount ?? 0) > 0;
          const rawMin = p.variantPriceMin;
          const rawMax = p.variantPriceMax;
          if (
            hasVariants &&
            rawMin != null &&
            rawMax != null &&
            Number.isFinite(Number(rawMin)) &&
            Number.isFinite(Number(rawMax))
          ) {
            const min = Number(rawMin);
            const max = Number(rawMax);
            if (min !== max) {
              return (
                <span className="whitespace-nowrap">
                  {formatInr(min)} <span className="text-muted-foreground">–</span> {formatInr(max)}
                </span>
              );
            }
            return formatInr(min);
          }
          return formatInr(basePrice);
        },
      },
      {
        id: "gst",
        header: "GST",
        meta: { headerClassName: "text-right", cellClassName: "text-right tabular-nums text-muted-foreground" },
        cell: () => `${Number(defaultGstPercent)}%`,
      },
      {
        accessorKey: "stockQty",
        header: "Stock",
        meta: { headerClassName: "text-right", cellClassName: "text-right" },
        cell: ({ row }) => {
          const branches = (Array.isArray(row.original.branchStocks)
            ? row.original.branchStocks
            : []) as BranchStock[];
          const selectedBranchStock =
            selectedBranchId != null ? branches.find((branch) => branch.branchId === selectedBranchId) : null;
          const displayStock =
            selectedBranchId != null
              ? selectedBranchStock?.stockQty ?? 0
              : Number(row.original.stockQty ?? 0);
          const low =
            selectedBranchId != null
              ? displayStock <= Number(row.original.lowStockThreshold ?? 10)
              : row.original.isLowStock === true;
          return (
            <div className="space-y-1">
              <div className={cn("font-medium tabular-nums", low && "text-destructive")}>
                {displayStock}
              </div>
              {selectedBranchId != null ? (
                <div className="text-xs text-muted-foreground">
                  {/* {selectedBranchStock?.branchName ?? "Selected branch"} */}
                </div>
              ) : branches.length > 0 ? (
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  {branches.map((branch) => (
                    <div
                      key={branch.branchId ?? "unassigned"}
                      className="flex items-center justify-end gap-2 whitespace-nowrap"
                    >
                      <span className="max-w-[90px] truncate" title={branch.branchName}>
                        {branch.branchName}
                      </span>
                      <span className="font-mono text-foreground">{branch.stockQty}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "variants",
        header: "Variants",
        meta: { cellClassName: "text-center" },
        cell: ({ row }) => {
          const p = row.original;
          const n = p.variantCount ?? 0;
          if (n === 0) {
            return <span className="text-sm text-muted-foreground">—</span>;
          }
          return (
            <Button variant="outline" size="sm" className="rounded-full gap-1.5 text-xs font-medium border-border/80" asChild>
              <Link href={`/products/${p.id}`}>
                <Layers className="h-3.5 w-3.5" />
                Variants ({n})
              </Link>
            </Button>
          );
        },
      },
      {
        id: "actions",
        header: "",
        meta: { headerClassName: "w-[100px]", cellClassName: "text-right" },
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" asChild>
                <Link href={`/products/${p.id}`} aria-label="View product">
                  <Eye className="h-4 w-4" />
                </Link>
              </Button>
              {can("products", "edit") && (
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" asChild>
                  <Link href={`/products/${p.id}/edit`} aria-label="Edit product">
                    <Edit className="h-4 w-4" />
                  </Link>
                </Button>
              )}
              {can("products", "delete") && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                  aria-label="Delete product"
                  onClick={() => {
                    if (confirm("Delete this product and all its variants?")) {
                      deleteProduct.mutate({ id: p.id });
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [can, deleteProduct, defaultGstPercent, selectedBranchId],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Products</h2>
          <p className="text-muted-foreground">Manage your product catalog and variants</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can("products", "view") ? (
            <ProductsExportDialog search={search} categoryId={categoryId} lowStock={lowStock} />
          ) : null}
          {can("products", "add") ? (
            <Button asChild>
              <Link href="/products/new">
                <Plus className="mr-2 h-4 w-4" />
                Add Product
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-4 bg-card p-4 rounded-lg border">
        <div className="flex flex-1 flex-wrap gap-4 items-center">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              className="pl-8"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <ListDateRangeFilter
            context="products"
            value={dateRange}
            onChange={(next) => {
              setDateRange(next);
              setPage(1);
            }}
          />
          <ListCategoryFilter
            value={categoryId}
            onChange={(next) => {
              setCategoryId(next);
              setPage(1);
            }}
          />
          <div className="flex items-center gap-2">
            <Switch
              id="low-stock-only"
              checked={lowStock}
              onCheckedChange={(v) => {
                setLowStock(v);
                setPage(1);
              }}
            />
            <Label htmlFor="low-stock-only" className="text-sm font-medium cursor-pointer whitespace-nowrap">
              Low stock only
            </Label>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <DataTable
          columns={columns}
          data={items}
          isLoading={isLoading}
          emptyMessage="No products found."
          footer={
            <DataTablePaginationFooter
              page={page}
              total={total}
              limit={limit}
              onPageChange={setPage}
              itemLabel="products"
            />
          }
        />
      </div>
    </div>
  );
}
