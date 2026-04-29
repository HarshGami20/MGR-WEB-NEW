import { useState } from "react";
import {
  useListProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, getListProductsQueryKey,
  useListCategories,
  useListProductVariants, useCreateProductVariant, useUpdateProductVariant, useDeleteProductVariant,
  getListProductVariantsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit, Trash2, Layers, X, ChevronRight } from "lucide-react";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

/* ─── Product form ─────────────────────────────────────────────────────────── */
const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  categoryId: z.number().nullable().optional(),
  price: z.coerce.number().min(0, "Price must be positive"),
  gstPercent: z.coerce.number().min(0, "GST must be positive"),
  stockQty: z.coerce.number().min(0, "Stock must be positive"),
  lowStockThreshold: z.coerce.number().min(0, "Threshold must be positive"),
  description: z.string().optional().nullable(),
});
type ProductFormValues = z.infer<typeof productSchema>;

/* ─── Variant form ─────────────────────────────────────────────────────────── */
const variantSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  price: z.coerce.number().nullable().optional(),
  stockQty: z.coerce.number().int().min(0, "Must be ≥ 0"),
  isActive: z.boolean(),
  attributes: z.array(z.object({ key: z.string(), value: z.string() })),
});
type VariantFormValues = z.infer<typeof variantSchema>;

const emptyVariantForm: VariantFormValues = {
  name: "", sku: "", price: undefined, stockQty: 0, isActive: true, attributes: [],
};

function attrsToJson(attrs: { key: string; value: string }[]): string | null {
  const obj: Record<string, string> = {};
  attrs.forEach(({ key, value }) => { if (key.trim()) obj[key.trim()] = value; });
  return Object.keys(obj).length ? JSON.stringify(obj) : null;
}

function jsonToAttrs(json: string | null | undefined): { key: string; value: string }[] {
  if (!json) return [];
  try {
    const obj = JSON.parse(json);
    return Object.entries(obj).map(([key, value]) => ({ key, value: String(value) }));
  } catch { return []; }
}

/* ─── Variant attributes display ────────────────────────────────────────────── */
function AttrTags({ json }: { json?: string | null }) {
  const attrs = jsonToAttrs(json);
  if (!attrs.length) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {attrs.map(({ key, value }) => (
        <span key={key} className="text-xs bg-muted px-1.5 py-0.5 rounded">
          <span className="font-medium">{key}:</span> {value}
        </span>
      ))}
    </div>
  );
}

/* ─── Variant form dialog ────────────────────────────────────────────────────── */
function VariantFormDialog({
  open, onClose, productId, editingVariant, parentSku,
}: {
  open: boolean;
  onClose: () => void;
  productId: number;
  editingVariant: any | null;
  parentSku: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createVariant = useCreateProductVariant({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductVariantsQueryKey(productId) });
        toast({ title: "Variant created" });
        onClose();
      },
      onError: (e: any) => toast({ title: "Error", description: e.data?.error || e.message, variant: "destructive" }),
    },
  });

  const updateVariant = useUpdateProductVariant({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductVariantsQueryKey(productId) });
        toast({ title: "Variant updated" });
        onClose();
      },
      onError: (e: any) => toast({ title: "Error", description: e.data?.error || e.message, variant: "destructive" }),
    },
  });

  const form = useForm<VariantFormValues>({
    resolver: zodResolver(variantSchema),
    defaultValues: editingVariant
      ? {
          name: editingVariant.name,
          sku: editingVariant.sku,
          price: editingVariant.price ?? undefined,
          stockQty: editingVariant.stockQty,
          isActive: editingVariant.isActive,
          attributes: jsonToAttrs(editingVariant.attributes),
        }
      : { ...emptyVariantForm, sku: `${parentSku}-V${Date.now().toString().slice(-4)}` },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "attributes" });

  const onSubmit = (data: VariantFormValues) => {
    const payload: any = {
      name: data.name,
      sku: data.sku,
      price: data.price ?? null,
      stockQty: data.stockQty,
      isActive: data.isActive,
      attributes: attrsToJson(data.attributes),
    };
    if (editingVariant) {
      updateVariant.mutate({ productId, variantId: editingVariant.id, data: payload });
    } else {
      createVariant.mutate({ productId, data: payload });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{editingVariant ? "Edit Variant" : "Add Variant"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Variant Name *</FormLabel>
                  <FormControl><Input placeholder="e.g. King – Brown" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="sku" render={({ field }) => (
                <FormItem>
                  <FormLabel>SKU *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="price" render={({ field }) => (
                <FormItem>
                  <FormLabel>Price Override (₹)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Leave blank = base price"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="stockQty" render={({ field }) => (
                <FormItem>
                  <FormLabel>Stock Qty</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="isActive" render={({ field }) => (
              <FormItem className="flex items-center gap-3 space-y-0">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="font-normal">Active</FormLabel>
              </FormItem>
            )} />

            {/* Dynamic attributes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Attributes (e.g. Size, Color, Material)</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => append({ key: "", value: "" })}>
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {fields.length === 0 && (
                <p className="text-xs text-muted-foreground">No attributes yet. Click Add to define Size, Color, etc.</p>
              )}
              {fields.map((f, index) => (
                <div key={f.id} className="flex gap-2 items-start">
                  <FormField control={form.control} name={`attributes.${index}.key`} render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl><Input placeholder="Size" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <ChevronRight className="h-4 w-4 mt-2.5 text-muted-foreground shrink-0" />
                  <FormField control={form.control} name={`attributes.${index}.value`} render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl><Input placeholder="King" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <Button type="button" variant="ghost" size="icon" className="mt-0.5 shrink-0" onClick={() => remove(index)}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={createVariant.isPending || updateVariant.isPending}>
                {editingVariant ? "Update Variant" : "Create Variant"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Variants panel dialog ──────────────────────────────────────────────────── */
function VariantsPanel({ product, onClose }: { product: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingVariant, setEditingVariant] = useState<any | null>(null);
  const [addingVariant, setAddingVariant] = useState(false);

  const { data: variants, isLoading } = useListProductVariants(product.id);

  const deleteVariant = useDeleteProductVariant({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductVariantsQueryKey(product.id) });
        toast({ title: "Variant deleted" });
      },
    },
  });

  const toggleVariant = useUpdateProductVariant({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductVariantsQueryKey(product.id) });
      },
    },
  });

  const variantList = Array.isArray(variants) ? variants : [];

  return (
    <>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div>
              <DialogTitle className="text-lg">Variants — {product.name}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                SKU: <span className="font-mono">{product.sku}</span> · Base price: ₹{Number(product.price).toLocaleString()}
              </p>
            </div>
          </DialogHeader>

          <div className="flex items-center justify-between mt-2">
            <p className="text-sm text-muted-foreground">{variantList.length} variant{variantList.length !== 1 ? "s" : ""}</p>
            <Button size="sm" onClick={() => setAddingVariant(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Variant
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto mt-2 border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Attributes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[90px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="h-16 text-center">Loading...</TableCell></TableRow>
                ) : variantList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-16 text-center text-muted-foreground">
                      No variants yet. Click "Add Variant" to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  variantList.map((v: any) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                      <TableCell>
                        {v.price != null
                          ? <span>₹{Number(v.price).toLocaleString()}</span>
                          : <span className="text-muted-foreground text-xs">Base</span>}
                      </TableCell>
                      <TableCell>
                        <span className={v.stockQty === 0 ? "text-destructive font-medium" : ""}>{v.stockQty}</span>
                      </TableCell>
                      <TableCell><AttrTags json={v.attributes} /></TableCell>
                      <TableCell>
                        <button
                          onClick={() => toggleVariant.mutate({ productId: product.id, variantId: v.id, data: { isActive: !v.isActive } })}
                          className="cursor-pointer"
                        >
                          {v.isActive
                            ? <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 cursor-pointer">Active</Badge>
                            : <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 cursor-pointer">Inactive</Badge>}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setEditingVariant(v)}>
                            <Edit className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => {
                            if (confirm(`Delete variant "${v.name}"?`)) {
                              deleteVariant.mutate({ productId: product.id, variantId: v.id });
                            }
                          }}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {(addingVariant || editingVariant) && (
        <VariantFormDialog
          open
          onClose={() => { setAddingVariant(false); setEditingVariant(null); }}
          productId={product.id}
          editingVariant={editingVariant}
          parentSku={product.sku}
        />
      )}
    </>
  );
}

/* ─── Main Products page ─────────────────────────────────────────────────────── */
export default function Products() {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [variantProduct, setVariantProduct] = useState<any | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: productsData, isLoading } = useListProducts({
    search: search || undefined,
    categoryId,
    lowStock: lowStock ? true : undefined,
    page,
    limit: 15,
  });

  const { data: categoriesData } = useListCategories();

  const createProduct = useCreateProduct({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        toast({ title: "Product created successfully" });
        setIsProductDialogOpen(false);
      },
    },
  });

  const updateProduct = useUpdateProduct({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        toast({ title: "Product updated successfully" });
        setIsProductDialogOpen(false);
      },
    },
  });

  const deleteProduct = useDeleteProduct({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        toast({ title: "Product deleted successfully" });
      },
    },
  });

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "", sku: "", categoryId: undefined,
      price: 0, gstPercent: 18, stockQty: 0, lowStockThreshold: 5, description: "",
    },
  });

  const openCreateDialog = () => {
    setEditingId(null);
    form.reset({ name: "", sku: "", categoryId: undefined, price: 0, gstPercent: 18, stockQty: 0, lowStockThreshold: 5, description: "" });
    setIsProductDialogOpen(true);
  };

  const openEditDialog = (product: any) => {
    setEditingId(product.id);
    form.reset({
      name: product.name,
      sku: product.sku,
      categoryId: product.categoryId,
      price: product.price,
      gstPercent: product.gstPercent,
      stockQty: product.stockQty,
      lowStockThreshold: product.lowStockThreshold,
      description: product.description || "",
    });
    setIsProductDialogOpen(true);
  };

  const onSubmit = (data: ProductFormValues) => {
    if (editingId) {
      updateProduct.mutate({ id: editingId, data });
    } else {
      createProduct.mutate({ data });
    }
  };

  const categories = (categoriesData as any)?.data ?? categoriesData ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Products</h2>
          <p className="text-muted-foreground">Manage your product catalog and variants</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Product
        </Button>
      </div>

      <div className="flex flex-wrap gap-4 items-center bg-card p-4 rounded-lg border">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={categoryId?.toString() || "all"}
          onValueChange={(val) => setCategoryId(val === "all" ? undefined : parseInt(val))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {(Array.isArray(categories) ? categories : []).map((c: any) => (
              <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center space-x-2">
          <Switch id="low-stock" checked={lowStock} onCheckedChange={setLowStock} />
          <Label htmlFor="low-stock">Low Stock Only</Label>
        </div>
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price (₹)</TableHead>
              <TableHead className="text-right">GST</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead>Variants</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">Loading...</TableCell>
              </TableRow>
            ) : productsData?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No products found.</TableCell>
              </TableRow>
            ) : (
              productsData?.data?.map((product: any) => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                  <TableCell className="font-medium">
                    {product.name}
                    {product.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{product.description}</p>
                    )}
                  </TableCell>
                  <TableCell>{product.category?.name || "-"}</TableCell>
                  <TableCell className="text-right">₹{Number(product.price).toLocaleString()}</TableCell>
                  <TableCell className="text-right">{product.gstPercent}%</TableCell>
                  <TableCell className="text-right">
                    <span className={product.stockQty <= product.lowStockThreshold ? "text-destructive font-medium" : ""}>
                      {product.stockQty}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => setVariantProduct(product)}
                    >
                      <Layers className="h-3 w-3" />
                      Variants
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(product)}>
                        <Edit className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => {
                        if (confirm("Delete this product and all its variants?")) deleteProduct.mutate({ id: product.id });
                      }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {productsData && productsData.total > productsData.limit && (
          <div className="p-4 border-t flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Page {page} · {productsData.total} total
            </span>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * productsData.limit >= productsData.total}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* Product create/edit dialog */}
      <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="sku" render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="categoryId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select value={field.value?.toString()} onValueChange={(val) => field.onChange(parseInt(val))}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(Array.isArray(categories) ? categories : []).map((c: any) => (
                          <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="price" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base Price (₹)</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <FormField control={form.control} name="gstPercent" render={({ field }) => (
                  <FormItem>
                    <FormLabel>GST (%)</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="stockQty" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="lowStockThreshold" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min Stock</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsProductDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createProduct.isPending || updateProduct.isPending}>
                  {editingId ? "Update Product" : "Create Product"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Variants management panel */}
      {variantProduct && (
        <VariantsPanel product={variantProduct} onClose={() => setVariantProduct(null)} />
      )}
    </div>
  );
}
