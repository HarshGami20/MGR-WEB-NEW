import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateProductVariant,
  useUpdateProductVariant,
  getListProductVariantsQueryKey,
  getGetProductQueryKey,
  useListAttributeCatalog,
  useCreateAttributeKey,
  useDeleteAttributeKey,
  getListAttributeCatalogQueryKey,
} from "@/api-client";
import type { CreateProductVariantBody, ProductVariant, UpdateProductVariantBody } from "@/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, ChevronRight, Settings2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePermissions } from "@/lib/permissions";
import { z } from "zod";
import { useForm, useFieldArray, Control, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage as BaseFormMessage,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductImagesField } from "@/components/product-images-field";
import { variantImageList } from "@/lib/image-urls";
import { cn } from "@/lib/utils";

function FormMessage({ className, ...props }: ComponentProps<typeof BaseFormMessage>) {
  return <BaseFormMessage className={cn("static mt-1", className)} {...props} />;
}

export function flattenCategoryRoots(roots: unknown[]): { id: number; name: string; parentId?: number | null }[] {
  const out: { id: number; name: string; parentId?: number | null }[] = [];
  for (const r of roots as { id?: number; name: string; parentId?: number | null; children?: unknown[] }[]) {
    if (r?.id == null) continue;
    out.push({ id: r.id, name: r.name, parentId: r.parentId ?? null });
    for (const ch of r.children ?? []) {
      const c = ch as { id?: number; name: string; parentId?: number | null };
      if (c?.id == null) continue;
      out.push({ id: c.id, name: c.name, parentId: c.parentId ?? null });
    }
  }
  return out;
}

const variantObjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Use at most 200 characters"),
  sku: z.string().trim().min(1, "SKU is required").max(80, "SKU must be 80 characters or less"),
  imageUrls: z.array(z.string()).default([]),
  price: z.coerce.number().nullable().optional(),
  stockQty: z.coerce.number().int().min(0, "Must be ≥ 0"),
  lowStockThreshold: z.coerce.number().int().min(0),
  isActive: z.boolean(),
  attributes: z.array(z.object({ key: z.string(), value: z.string() })),
});

export const variantSchema = variantObjectSchema;
export type VariantFormValues = z.infer<typeof variantSchema>;

const variantDraftObjectSchema = variantObjectSchema.omit({ isActive: true });

export const variantDraftSchema = variantDraftObjectSchema;

export type VariantDraftFormValues = z.infer<typeof variantDraftSchema>;

/** Edit/create form row — `variantId` set when syncing an existing API variant */
export const variantDraftWithPersistedIdSchema = variantDraftObjectSchema.extend({
  variantId: z.number().optional(),
});
export type VariantDraftWithPersistedId = z.infer<typeof variantDraftWithPersistedIdSchema>;

export const MAX_PRODUCT_PRICE = 999_999_999.99;
export const PRODUCT_SKU_REGEX = /^[A-Za-z0-9][A-Za-z0-9\-_/]*$/;

export function refineOptionalImageUrlField(
  raw: string | undefined | null,
  path: (string | number)[],
  ctx: z.RefinementCtx,
) {
  const s = (raw ?? "").trim();
  if (!s) return;
  if (s.length > 500) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "URL is too long", path });
    return;
  }
  if (s.startsWith("/uploads/")) return;
  try {
    // eslint-disable-next-line no-new
    new URL(s);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid image URL", path });
  }
}

const baseProductFormFields = {
  name: z
    .string()
    .trim()
    .min(4, "Product name must be at least 4 characters")
    .max(200, "Use at most 200 characters"),
  parentCategoryId: z.string().min(1, "Select a category"),
  subCategoryId: z.string().optional(),
  sku: z
    .string()
    .trim()
    .min(1, "SKU is required")
    .max(80, "SKU must be 80 characters or less")
    .regex(
      PRODUCT_SKU_REGEX,
      "Use letters, numbers, hyphens, underscores, or slashes (must start with alphanumeric)",
    ),
  description: z.string().max(5000, "Description is too long (max 5000 characters)").optional().nullable(),
  price: z.coerce
    .number({ invalid_type_error: "Enter a valid price" })
    .min(0, "Price must be ≥ 0")
    .max(MAX_PRODUCT_PRICE, "Price is too large"),
  lowStockThreshold: z.coerce
    .number({ invalid_type_error: "Enter a valid threshold" })
    .int("Use a whole number")
    .min(0, "Must be ≥ 0")
    .max(999_999_999, "Value is too large"),
  inventoryMode: z.enum(["simple", "variants"]),
  imageUrls: z.array(z.string()).default([]),
  attributes: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
};

function refineAttributeRows(
  attrs: { key: string; value: string }[],
  pathPrefix: (string | number)[],
  ctx: z.RefinementCtx,
) {
  attrs.forEach((attr, ai) => {
    const k = attr.key.trim();
    const val = attr.value.trim();
    if (k && !val) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a value or remove the attribute row",
        path: [...pathPrefix, ai, "value"],
      });
    }
    if (!k && val) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter an attribute name or clear the value",
        path: [...pathPrefix, ai, "key"],
      });
    }
  });
}

export function refineSimpleProductAttributes(
  data: { inventoryMode: "simple" | "variants"; attributes: { key: string; value: string }[] },
  ctx: z.RefinementCtx,
) {
  if (data.inventoryMode !== "simple") return;
  refineAttributeRows(data.attributes, ["attributes"], ctx);
}

export function refineProductFormVariantRows(
  data: {
    inventoryMode: "simple" | "variants";
    sku: string;
    variants: Array<{
      name: string;
      sku: string;
      imageUrls?: string[];
      price?: number | null;
      lowStockThreshold: number;
      attributes: { key: string; value: string }[];
    }>;
  },
  ctx: z.RefinementCtx,
) {
  if (data.inventoryMode !== "variants" || data.variants.length === 0) return;

  const baseSku = data.sku.trim().toLowerCase();
  const seen = new Set<string>();

  data.variants.forEach((v, i) => {
    const trimmedName = v.name.trim();
    if (!trimmedName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Name is required",
        path: ["variants", i, "name"],
      });
    } else if (trimmedName.length > 120) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use at most 120 characters",
        path: ["variants", i, "name"],
      });
    }

    const vs = v.sku.trim();
    if (!PRODUCT_SKU_REGEX.test(vs)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use letters, numbers, hyphens, underscores, or slashes",
        path: ["variants", i, "sku"],
      });
    }
    const vsLower = vs.toLowerCase();
    if (vsLower) {
      if (seen.has(vsLower)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate variant SKU",
          path: ["variants", i, "sku"],
        });
      }
      seen.add(vsLower);
      if (baseSku && vsLower === baseSku) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Variant SKU must differ from the product SKU",
          path: ["variants", i, "sku"],
        });
      }
    }

    if (v.price != null) {
      const p = Number(v.price);
      if (!Number.isFinite(p) || p < 0 || p > MAX_PRODUCT_PRICE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a valid price",
          path: ["variants", i, "price"],
        });
      }
    }

    const thr = v.lowStockThreshold;
    if (!Number.isFinite(thr) || !Number.isInteger(thr) || thr < 0 || thr > 999_999_999) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a whole number ≥ 0",
        path: ["variants", i, "lowStockThreshold"],
      });
    }

    v.attributes.forEach((attr, ai) => {
      const k = attr.key.trim();
      const val = attr.value.trim();
      if (k && !val) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a value or remove the attribute row",
          path: ["variants", i, "attributes", ai, "value"],
        });
      }
      if (!k && val) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter an attribute name or clear the value",
          path: ["variants", i, "attributes", ai, "key"],
        });
      }
    });

    (v.imageUrls ?? []).forEach((url, ui) => {
      refineOptionalImageUrlField(url, ["variants", i, "imageUrls", ui], ctx);
    });
  });
}

export function variantImagesToApi(v: { imageUrls?: string[] | null }): {
  imageUrls?: string[];
  imageUrl: string | null;
} {
  const urls = (v.imageUrls ?? []).map((u) => u.trim()).filter(Boolean);
  return { imageUrls: urls.length > 0 ? urls : undefined, imageUrl: urls[0] ?? null };
}

export const productNewObjectSchema = z.object({
  ...baseProductFormFields,
  variants: z.array(variantDraftSchema),
});

function refineProductImageUrls(urls: string[], ctx: z.RefinementCtx) {
  urls.forEach((url, i) => refineOptionalImageUrlField(url, ["imageUrls", i], ctx));
}

export const productNewSchema = productNewObjectSchema.superRefine((data, ctx) => {
  refineProductFormVariantRows(data, ctx);
  refineSimpleProductAttributes(data, ctx);
  refineProductImageUrls(data.imageUrls ?? [], ctx);
});

export const productEditObjectSchema = z.object({
  ...baseProductFormFields,
  variants: z.array(variantDraftWithPersistedIdSchema),
});

export const productEditSchema = productEditObjectSchema.superRefine((data, ctx) => {
  refineProductFormVariantRows(data, ctx);
  refineSimpleProductAttributes(data, ctx);
  refineProductImageUrls(data.imageUrls ?? [], ctx);
});

export type ProductNewFormValues = z.infer<typeof productNewObjectSchema>;
export type ProductEditFormValues = z.infer<typeof productEditObjectSchema>;

/** Matches order form section styling (`FormSection` on order-form-page). */
export function ProductFormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm md:p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-xs text-muted-foreground mt-0.5">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function productVariantToDraftRow(v: ProductVariant): VariantDraftWithPersistedId {
  return {
    variantId: v.id,
    name: v.name,
    sku: v.sku,
    imageUrls: variantImageList(v as { imageUrls?: string | string[] | null; imageUrl?: string | null }),
    price: v.price ?? undefined,
    stockQty: v.stockQty,
    lowStockThreshold: v.lowStockThreshold,
    attributes: jsonToAttrs(v.attributes),
  };
}

export const emptyVariantDraft: VariantDraftFormValues = {
  name: "",
  sku: "",
  imageUrls: [],
  price: undefined,
  stockQty: 0,
  lowStockThreshold: 10,
  attributes: [],
};

export const emptyVariantForm: VariantFormValues = {
  name: "",
  sku: "",
  imageUrls: [],
  price: undefined,
  stockQty: 0,
  lowStockThreshold: 10,
  isActive: true,
  attributes: [],
};

export function attrsToJson(attrs: { key: string; value: string }[]): string | null {
  const obj: Record<string, string> = {};
  attrs.forEach(({ key, value }) => {
    if (key.trim()) obj[key.trim()] = value;
  });
  return Object.keys(obj).length ? JSON.stringify(obj) : null;
}

export function jsonToAttrs(json: string | null | undefined): { key: string; value: string }[] {
  if (!json) return [];
  try {
    const obj = JSON.parse(json);
    return Object.entries(obj).map(([key, value]) => ({ key, value: String(value) }));
  } catch {
    return [];
  }
}

export function AttrTags({ json }: { json?: string | null }) {
  const attrs = jsonToAttrs(json);
  if (!attrs.length) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {attrs.map(({ key, value }) => (
        <span key={`${key}-${value}`} className="text-xs bg-muted px-1.5 py-0.5 rounded">
          <span className="font-medium">{key}:</span> {value}
        </span>
      ))}
    </div>
  );
}

export function attributesPlainLine(json: string | null | undefined): string {
  const attrs = jsonToAttrs(json);
  if (!attrs.length) return "";
  return attrs.map(({ value }) => value).filter(Boolean).join(" ");
}

export function AttributesEditorBlock({ control, namePrefix = "attributes" }: { control: Control<any>; namePrefix?: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { can } = usePermissions();
  const canDeleteAttributes = can("products", "delete");
  const { data: catalog } = useListAttributeCatalog();
  const keys = catalog?.keys ?? [];

  const createKey = useCreateAttributeKey({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAttributeCatalogQueryKey() });
      },
    },
  });

  const deleteKey = useDeleteAttributeKey({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAttributeCatalogQueryKey() });
        toast({ title: "Attribute type deleted" });
        setKeyToDelete(null);
      },
      onError: (e: unknown) =>
        toast({ title: "Could not delete", description: String(e), variant: "destructive" }),
    },
  });

  const [manageTypesOpen, setManageTypesOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [keyToDelete, setKeyToDelete] = useState<{ id: number; name: string } | null>(null);

  const { fields, append, remove } = useFieldArray({ control, name: namePrefix as never });

  const addAttributeType = () => {
    const n = newKeyName.trim();
    if (!n) {
      toast({ title: "Enter a name", variant: "destructive" });
      return;
    }
    createKey.mutate(
      { data: { name: n } },
      {
        onSuccess: () => {
          setNewKeyName("");
          setManageTypesOpen(false);
          toast({ title: "Attribute type saved — pick it from the list" });
        },
        onError: (e: unknown) =>
          toast({ title: "Could not add", description: String(e), variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="text-sm font-medium">Attributes</Label>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setManageTypesOpen(true)}>
            <Settings2 className="h-3.5 w-3.5 mr-1" /> Manage types
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => append({ key: "", value: "" })}>
            <Plus className="h-3 w-3 mr-1" /> Add row
          </Button>
        </div>
      </div>
      {fields.length === 0 && (
        <p className="text-xs text-muted-foreground">Optional — e.g. Color, Size. Types you add once appear for every product.</p>
      )}
      {fields.map((f, index) => (
        <div key={f.id} className="flex gap-2 items-start">
          <FormField
            control={control}
            name={`${namePrefix}.${index}.key` as never}
            render={({ field }) => (
              <FormItem className="flex-1 min-w-0">
                <FormControl>
                  <Select
                    value={field.value || undefined}
                    onValueChange={(v) => {
                      if (v === "__manage__") {
                        setManageTypesOpen(true);
                        return;
                      }
                      field.onChange(v);
                    }}
                  >
                    <SelectTrigger className="rounded-lg">
                      <SelectValue placeholder="Type (e.g. Color)" />
                    </SelectTrigger>
                    <SelectContent>
                      {keys.map((k) => (
                        <SelectItem key={k.id} value={k.name}>
                          {k.name}
                        </SelectItem>
                      ))}
                      <SelectSeparator />
                      <SelectItem value="__manage__" className="gap-2">
                        <span className="flex items-center gap-2">
                          <Settings2 className="h-4 w-4 shrink-0 opacity-70" />
                          Manage attributes…
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            )}
          />
          <ChevronRight className="h-4 w-4 mt-2.5 text-muted-foreground shrink-0" />
          <FormField
            control={control}
            name={`${namePrefix}.${index}.value` as never}
            render={({ field }) => (
              <FormItem className="flex-1 min-w-0">
                <FormControl>
                  <AttributeValueSelect
                    index={index}
                    control={control}
                    namePrefix={namePrefix}
                    value={field.value}
                    onChange={field.onChange}
                    catalogKeys={keys}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <Button type="button" variant="ghost" size="icon" className="mt-0.5 shrink-0" onClick={() => remove(index)}>
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      ))}

      <Sheet open={manageTypesOpen} onOpenChange={setManageTypesOpen}>
        <SheetContent side="top" className="max-h-[min(80vh,460px)] overflow-y-auto rounded-b-xl px-6 pb-6 pt-14 sm:max-w-xl sm:mx-auto">
          <SheetHeader className="space-y-1 text-left pb-4 border-b border-border/60">
            <SheetTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 shrink-0 text-muted-foreground" />
              Manage attributes
            </SheetTitle>
            <SheetDescription>Add reusable attribute types. They appear in every variant attribute picker.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            {keys.length > 0 ? (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Existing types</Label>
                <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                  {keys.map((k) => (
                    <li key={k.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{k.name}</p>
                        {k.values.length > 0 ? (
                          <p className="text-xs text-muted-foreground truncate">
                            {k.values.length} saved value{k.values.length === 1 ? "" : "s"}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">No saved values yet</p>
                        )}
                      </div>
                      {canDeleteAttributes ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Delete ${k.name}`}
                          disabled={deleteKey.isPending}
                          onClick={() => setKeyToDelete({ id: k.id, name: k.name })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No attribute types yet. Add one below.</p>
            )}
            <div className="space-y-3">
              <Label className="text-sm font-medium">New attribute type</Label>
              <p className="text-xs text-muted-foreground -mt-1">Examples: Color, Size, Material, Finish.</p>
              <div className="flex gap-2">
                <Input
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. Color"
                  className="h-10"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addAttributeType();
                    }
                  }}
                />
                <Button type="button" onClick={addAttributeType} disabled={createKey.isPending}>
                  Add
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!keyToDelete} onOpenChange={(open) => !open && setKeyToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete attribute type?</AlertDialogTitle>
            <AlertDialogDescription>
              {keyToDelete ? (
                <>
                  Remove <span className="font-medium text-foreground">{keyToDelete.name}</span> from the catalog.
                  Saved value suggestions for this type will be removed. Existing product variants keep their stored
                  attribute data.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteKey.isPending}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteKey.isPending || !keyToDelete}
              onClick={() => keyToDelete && deleteKey.mutate({ keyId: keyToDelete.id })}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AttributeValueSelect({
  index,
  control,
  namePrefix,
  value,
  onChange,
  catalogKeys,
}: {
  index: number;
  control: Control<any>;
  namePrefix: string;
  value: string;
  onChange: (v: string) => void;
  catalogKeys: { id: number; name: string; values: string[] }[];
}) {
  const keyName = useWatch({ control, name: `${namePrefix}.${index}.key` as never }) as string;
  const suggestions = catalogKeys.find((k) => k.name === keyName)?.values ?? [];
  const listId = `attr-val-${index}`;

  if (suggestions.length) {
    return (
      <>
        <datalist id={listId}>
          {suggestions.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <Input className="rounded-lg" placeholder="Value" list={listId} value={value} onChange={(e) => onChange(e.target.value)} />
      </>
    );
  }
  return <Input className="rounded-lg" placeholder="Value" value={value} onChange={(e) => onChange(e.target.value)} />;
}

export function VariantFormDialog({
  open,
  onClose,
  productId,
  editingVariant,
  parentSku,
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
        queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(productId) });
        queryClient.invalidateQueries({ queryKey: getListAttributeCatalogQueryKey() });
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
        queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(productId) });
        queryClient.invalidateQueries({ queryKey: getListAttributeCatalogQueryKey() });
        toast({ title: "Variant updated" });
        onClose();
      },
      onError: (e: any) => toast({ title: "Error", description: e.data?.error || e.message, variant: "destructive" }),
    },
  });

  const form = useForm<VariantFormValues>({
    resolver: zodResolver(variantSchema),
    defaultValues: { ...emptyVariantForm },
  });

  useEffect(() => {
    if (!open) return;
    if (editingVariant) {
      form.reset({
        name: editingVariant.name,
        sku: editingVariant.sku,
        imageUrls: variantImageList(editingVariant),
        price: editingVariant.price ?? undefined,
        stockQty: editingVariant.stockQty,
        lowStockThreshold: editingVariant.lowStockThreshold ?? 10,
        isActive: editingVariant.isActive,
        attributes: jsonToAttrs(editingVariant.attributes),
      });
    } else {
      form.reset({
        ...emptyVariantForm,
        sku: `${parentSku}-V${Date.now().toString().slice(-4)}`,
      });
    }
  }, [open, editingVariant, parentSku, form]);

  const onSubmit = (data: VariantFormValues) => {
    const imgs = variantImagesToApi(data);
    const payload: CreateProductVariantBody = {
      name: data.name,
      sku: data.sku,
      imageUrl: imgs.imageUrl,
      imageUrls: imgs.imageUrls,
      price: data.price ?? null,
      stockQty: data.stockQty,
      lowStockThreshold: data.lowStockThreshold,
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
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} >
      <DialogContent className="sm:max-w-[520px] rounded-2xl max-h-[90vh] overflow-y-auto ">
        <DialogHeader>
          <DialogTitle>{editingVariant ? "Edit Variant" : "Add Variant"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Variant Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. King – Brown" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU *</FormLabel>
                    <FormControl>
                      <Input className="font-mono text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="imageUrls"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <ProductImagesField
                      value={Array.isArray(field.value) ? field.value : []}
                      onChange={(urls) => field.onChange(urls)}
                      label="Variant photos"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
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
                )}
              />
              <FormField
                control={form.control}
                name="stockQty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock Qty</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="lowStockThreshold"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Low stock threshold</FormLabel>
                  <FormControl>
                    <Input type="number" className="max-w-[200px]" {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">Alert when this variant is at or below this quantity.</p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3 space-y-0">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="font-normal">Active</FormLabel>
                </FormItem>
              )}
            />

            <AttributesEditorBlock control={form.control} />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
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
