import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { GuideTarget } from "@/components/user-guide/guide-target";
import { LivePageRoot } from "@/components/user-guide/guide-live/shared";
import { DUMMY } from "@/lib/user-guide/mock-data";
import {
  AlignLeft,
  ArrowLeft,
  BadgeCheck,
  Download,
  Edit,
  Eye,
  Hexagon,
  ImageIcon,
  Layers,
  MoreVertical,
  Plus,
  Search,
  Star,
  Trash2,
  TrendingUp,
  Upload,
} from "lucide-react";

type ProductsPreviewProps = {
  screenId: string;
  activeHighlight: string | null;
};

function FormSection({
  title,
  description,
  children,
  targetId,
  activeHighlight,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  targetId: string;
  activeHighlight: string | null;
}) {
  return (
    <GuideTarget id={targetId} activeHighlight={activeHighlight} label={title}>
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground mt-1">{description}</p> : null}
        </div>
        {children}
      </div>
    </GuideTarget>
  );
}

function ProductsListPreview({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <LivePageRoot>
      <GuideTarget id="page-header" activeHighlight={activeHighlight} label="Products page">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Products</h2>
            <p className="text-muted-foreground">Manage your product catalog and variants</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <GuideTarget id="header-action-add" activeHighlight={activeHighlight} label="Add Product" dimOthers={false}>
              <Button disabled>
                <Plus className="mr-2 h-4 w-4" />
                Add Product
              </Button>
            </GuideTarget>
          </div>
        </div>
      </GuideTarget>

      <GuideTarget id="filters" activeHighlight={activeHighlight} label="Search & filters">
        <div className="flex flex-col gap-4 bg-card p-4 rounded-lg border">
          <div className="flex flex-1 flex-wrap gap-4 items-center">
            <GuideTarget id="search" activeHighlight={activeHighlight} label="Search" dimOthers={false} className="relative w-full max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input readOnly placeholder="Search products..." className="pl-8 bg-background" />
            </GuideTarget>
            <div className="h-9 rounded-md border bg-background px-3 flex items-center text-xs text-muted-foreground">
              Date range · All
            </div>
            <div className="h-9 rounded-md border bg-background px-3 flex items-center text-xs text-muted-foreground">
              Category · All
            </div>
            <div className="flex items-center gap-2">
              <Switch id="guide-products-low-stock" checked={false} disabled />
              <Label htmlFor="guide-products-low-stock" className="text-sm font-medium whitespace-nowrap">
                Low stock only
              </Label>
            </div>
          </div>
        </div>
      </GuideTarget>

      <GuideTarget id="data-table" activeHighlight={activeHighlight} label="Products table">
        <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[280px]">Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price (₹)</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-center">Variants</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  <div className="flex items-start gap-3 max-w-[280px]">
                    <div className="h-11 w-11 shrink-0 rounded-md border bg-muted/30 flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-muted-foreground opacity-60" />
                    </div>
                    <div className="min-w-0">
                      <span className="block truncate font-semibold">{DUMMY.product.name}</span>
                      <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">Premium upholstered sofa</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">{DUMMY.product.sku}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5 text-sm">
                    <span className="text-muted-foreground">Living room</span>
                    <span className="font-medium">{DUMMY.product.category}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">42,000 – 48,500</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">18%</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5 font-medium tabular-nums">
                    <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                    {DUMMY.product.stock}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Button variant="outline" size="sm" className="rounded-full gap-1.5 text-xs font-medium" disabled>
                    <Layers className="h-3.5 w-3.5" />
                    Variants (2)
                  </Button>
                </TableCell>
                <TableCell className="text-right">
                  <GuideTarget id="table-actions" activeHighlight={activeHighlight} label="Row actions" dimOthers={false}>
                    <div className="inline-flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-9 w-9" disabled>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9" disabled>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <GuideTarget id="delete-action" activeHighlight={activeHighlight} label="Delete" dimOthers={false} className="inline-flex">
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" disabled>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </GuideTarget>
                    </div>
                  </GuideTarget>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div className="border-t border-border/60 px-6 py-4 text-sm text-muted-foreground">Showing 1–15 of 24 products</div>
        </div>
      </GuideTarget>

      <GuideTarget id="delete-dialog" activeHighlight={activeHighlight} label="Delete confirmation">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 max-w-md ml-auto mt-4 text-sm">
          <p className="font-semibold text-destructive">Delete this product and all its variants?</p>
          <p className="text-xs text-muted-foreground mt-1">This confirmation appears when you click the trash icon.</p>
        </div>
      </GuideTarget>
    </LivePageRoot>
  );
}

function ProductFormPreviewShell({
  mode,
  activeHighlight,
}: {
  mode: "create" | "edit";
  activeHighlight: string | null;
}) {
  const isCreate = mode === "create";

  return (
    <div className="rounded-2xl border bg-muted/40 p-4 md:p-6 pointer-events-none select-none">
      <GuideTarget id="form-header" activeHighlight={activeHighlight} label="Product form header">
        <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 mb-6">
          <div className="flex min-w-0 items-start gap-3">
            <Button variant="ghost" size="icon" className="rounded-full shrink-0" disabled>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold md:text-2xl">{isCreate ? "Create product" : "Edit product"}</h1>
                {isCreate ? (
                  <Badge variant="outline" className="font-normal">
                    New
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-xl px-5" disabled>
              Cancel
            </Button>
            <GuideTarget id="form-save" activeHighlight={activeHighlight} label="Save product" dimOthers={false}>
              <Button className="rounded-xl px-6 shadow-sm" disabled>
                {isCreate ? "Create product" : "Save changes"}
              </Button>
            </GuideTarget>
          </div>
        </div>
      </GuideTarget>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 max-w-6xl mx-auto">
        <div className="space-y-6 lg:col-span-8">
          <FormSection title="Product details" targetId="product-details" activeHighlight={activeHighlight}>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Product name *</label>
                <Input readOnly className="mt-1.5 rounded-xl" value={DUMMY.product.name} />
              </div>
              <div>
                <label className="text-sm font-medium">Category *</label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <div className="h-10 rounded-xl border px-3 flex items-center text-sm text-muted-foreground">Living room</div>
                  <div className="h-10 rounded-xl border px-3 flex items-center text-sm">{DUMMY.product.category}</div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">SKU *</label>
                <Input readOnly className="mt-1.5 rounded-xl font-mono text-sm" value={DUMMY.product.sku} />
              </div>
              <div>
                <label className="text-sm font-medium">Description (optional)</label>
                <Textarea readOnly rows={3} className="mt-1.5 rounded-xl resize-none" value="Premium upholstered sofa set with solid wood frame." />
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Inventory type"
            description="Single SKU or multiple variants."
            targetId="inventory-type"
            activeHighlight={activeHighlight}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/70 p-4">
                <p className="font-semibold text-sm">Single SKU</p>
                <p className="text-xs text-muted-foreground mt-1">Quantity is managed in Inventory.</p>
              </div>
              <div className="rounded-xl border border-primary bg-primary/5 p-4">
                <p className="font-semibold text-sm">Has variants</p>
                <p className="text-xs text-muted-foreground mt-1">Colors, sizes, etc.</p>
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Variants"
            description="Add rows now or later from the product page."
            targetId="variants-section"
            activeHighlight={activeHighlight}
          >
            <div className="flex justify-end mb-3">
              <GuideTarget id="add-variant" activeHighlight={activeHighlight} label="Add variant" dimOthers={false}>
                <Button variant="outline" size="sm" disabled>
                  <Plus className="h-4 w-4 mr-1" />
                  Add variant
                </Button>
              </GuideTarget>
            </div>
            <div className="rounded-xl border border-border/50 p-4 space-y-3 bg-[hsl(0_0%_99%)]">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Variant 1</p>
              <div className="grid grid-cols-2 gap-3">
                <Input readOnly className="h-9" value="Charcoal · 3+2" />
                <Input readOnly className="h-9 font-mono text-sm" value="SOF-PREM-32-CH" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input readOnly className="h-9" value="45000" />
                <Input readOnly className="h-9" value="5" />
              </div>
            </div>
          </FormSection>
        </div>

        <aside className="space-y-6 lg:col-span-4">
          <FormSection title="Product photos" targetId="product-photos" activeHighlight={activeHighlight}>
            <div className="border-2 border-dashed rounded-xl p-6 flex flex-col items-center text-muted-foreground">
              <Upload className="h-8 w-8 mb-2 opacity-50" />
              <span className="text-xs">Catalog photos — drop or upload</span>
            </div>
          </FormSection>

          <FormSection title="Stock alerts" targetId="pricing-stock" activeHighlight={activeHighlight}>
            <div>
              <label className="text-sm font-medium">Product-level threshold</label>
              <Input readOnly className="mt-1.5 rounded-xl" value="10" />
              <p className="text-xs text-muted-foreground mt-1">Each variant can override this. Quantity updates come from Inventory.</p>
            </div>
          </FormSection>

          <FormSection title="GST" description="Applied on orders and invoices." targetId="gst-info" activeHighlight={activeHighlight}>
            <p className="text-sm text-muted-foreground">
              Default rate: <span className="font-medium text-foreground tabular-nums">18%</span> (change in Settings)
            </p>
          </FormSection>
        </aside>
      </div>
    </div>
  );
}

function ProductDetailPreview({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <div className="rounded-2xl bg-[hsl(0_0%_97%)] p-4 md:p-6 pointer-events-none select-none">
      <GuideTarget id="detail-header" activeHighlight={activeHighlight} label="Product header">
        <div className="flex items-start gap-3 max-w-7xl mx-auto">
          <Button variant="ghost" size="icon" className="rounded-full shrink-0" disabled>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{DUMMY.product.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>Living room · {DUMMY.product.category}</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1.5 text-green-700 font-medium">
                <span className="h-2 w-2 rounded-full bg-green-600" />
                Active
              </span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <GuideTarget id="detail-edit-btn" activeHighlight={activeHighlight} label="Edit product" dimOthers={false}>
              <Button className="rounded-xl gap-2 shadow-sm" disabled>
                <Edit className="h-4 w-4" />
                Edit
              </Button>
            </GuideTarget>
            <GuideTarget id="delete-action" activeHighlight={activeHighlight} label="More actions menu" dimOthers={false}>
              <Button variant="outline" size="icon" className="rounded-xl" disabled>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </GuideTarget>
          </div>
        </div>
      </GuideTarget>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12 max-w-7xl mx-auto">
        <div className="space-y-4 lg:col-span-4">
          <GuideTarget id="product-gallery" activeHighlight={activeHighlight} label="Photo gallery">
            <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
              <div className="aspect-[4/3] bg-muted/15 flex items-center justify-center">
                <ImageIcon className="h-10 w-10 text-muted-foreground opacity-40" />
              </div>
            </div>
          </GuideTarget>

          <GuideTarget id="product-stats" activeHighlight={activeHighlight} label="Stock & pricing stats">
            <div className="rounded-2xl border bg-white shadow-sm px-4 py-1">
              <div className="grid grid-cols-2 divide-x border-b">
                <div className="py-4 text-center">
                  <p className="text-2xl font-bold tabular-nums">{DUMMY.product.stock}</p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total units</p>
                </div>
                <div className="py-4 text-center">
                  <p className="text-2xl font-bold tabular-nums">2</p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Variations</p>
                </div>
              </div>
              <div className="py-3 space-y-0 text-sm">
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <TrendingUp className="h-4 w-4" /> GST Rate
                  </span>
                  <span className="font-semibold">18.00% (Settings)</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <BadgeCheck className="h-4 w-4" /> Base SKU
                  </span>
                  <span className="font-semibold font-mono text-xs">{DUMMY.product.sku}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Star className="h-4 w-4" /> Price Range
                  </span>
                  <span className="font-semibold tabular-nums">₹42k – ₹48.5k</span>
                </div>
              </div>
            </div>
          </GuideTarget>
        </div>

        <div className="space-y-6 lg:col-span-8">
          <GuideTarget id="product-description" activeHighlight={activeHighlight} label="Description">
            <div className="rounded-2xl border bg-white shadow-sm p-5 md:p-6">
              <div className="flex items-center gap-2 mb-3">
                <AlignLeft className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Description</h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Premium upholstered sofa set with solid wood frame. Available in multiple fabric and size combinations.
              </p>
            </div>
          </GuideTarget>

          <GuideTarget id="variants-table" activeHighlight={activeHighlight} label="Variations table">
            <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b px-5 py-4 md:px-6">
                <div className="flex items-center gap-2">
                  <Hexagon className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Variations</h2>
                  <Badge variant="secondary" className="rounded-md tabular-nums">
                    2
                  </Badge>
                </div>
                <Button variant="outline" className="rounded-xl border-dashed border-primary text-primary gap-1.5" disabled>
                  <Plus className="h-4 w-4" />
                  Add variation
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/25 hover:bg-muted/25">
                    <TableHead className="text-[11px] uppercase tracking-wider">Photo</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider">Name / SKU</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider">Price</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider">Stock</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>
                      <div className="h-10 w-10 rounded-md border bg-muted/30" />
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">Charcoal · 3+2</p>
                      <p className="font-mono text-xs text-muted-foreground">SOF-PREM-32-CH</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">45,000</TableCell>
                    <TableCell className="text-right tabular-nums">5</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </GuideTarget>
        </div>
      </div>

      <GuideTarget id="delete-dialog" activeHighlight={activeHighlight} label="Delete product">
        <div className="rounded-lg border bg-white shadow-lg p-4 max-w-sm ml-auto mt-6">
          <p className="font-semibold text-sm text-destructive">Delete product</p>
          <p className="text-xs text-muted-foreground mt-1">From the ⋮ menu — deletes product and all variants.</p>
        </div>
      </GuideTarget>
    </div>
  );
}

export function GuideLiveProductsPreview({ screenId, activeHighlight }: ProductsPreviewProps) {
  if (screenId === "products-list" || screenId === "products-delete") {
    return <ProductsListPreview activeHighlight={activeHighlight} />;
  }
  if (screenId === "products-create") {
    return <ProductFormPreviewShell mode="create" activeHighlight={activeHighlight} />;
  }
  if (screenId === "products-edit") {
    return <ProductFormPreviewShell mode="edit" activeHighlight={activeHighlight} />;
  }
  if (screenId === "products-detail") {
    return <ProductDetailPreview activeHighlight={activeHighlight} />;
  }
  return <ProductsListPreview activeHighlight={activeHighlight} />;
}
