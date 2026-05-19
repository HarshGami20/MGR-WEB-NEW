import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListCategories, useCreateCategory, getListCategoriesQueryKey } from "@/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/lib/permissions";
import { Settings2 } from "lucide-react";

export type CategoryRoot = { id: number; name: string; children?: { id: number; name: string }[] };

export function CategoryPickerWithManage({
  parentCategoryId,
  subCategoryId,
  onParentChange,
  onSubChange,
  roots: rootsProp,
}: {
  parentCategoryId: string;
  subCategoryId: string;
  onParentChange: (id: string) => void;
  onSubChange: (id: string) => void;
  /** When provided (e.g. edit product page), avoids a second fetch and keeps options in sync with form hydrate. */
  roots?: CategoryRoot[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { can } = usePermissions();
  const canManageCategories = can("categories", "add");

  const { data: categoriesData } = useListCategories({
    query: { enabled: rootsProp === undefined },
  });
  const fetchedRoots = useMemo(
    () => (Array.isArray(categoriesData) ? (categoriesData as CategoryRoot[]) : []) ?? [],
    [categoriesData],
  );
  const roots = rootsProp ?? fetchedRoots;
  const rootsKey = roots.map((r) => r.id).join(",");

  const createCategory = useCreateCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
      },
    },
  });

  const [manageOpen, setManageOpen] = useState(false);
  const [newRootName, setNewRootName] = useState("");
  const [subParentId, setSubParentId] = useState("");
  const [newSubName, setNewSubName] = useState("");

  const subcategories = useMemo(() => {
    const pid = parseInt(parentCategoryId, 10);
    if (!Number.isFinite(pid)) return [];
    const parent = roots.find((r) => r.id === pid);
    return parent?.children ?? [];
  }, [roots, parentCategoryId]);

  const handleParentSelectChange = (v: string) => {
    if (v === "__manage__") {
      setManageOpen(true);
      return;
    }
    onParentChange(v);
    onSubChange("");
  };

  const handleAddRoot = () => {
    const n = newRootName.trim();
    if (!n) {
      toast({ title: "Enter a category name", variant: "destructive" });
      return;
    }
    createCategory.mutate(
      { data: { name: n, parentId: null } },
      {
        onSuccess: (created) => {
          setNewRootName("");
          onParentChange(String(created.id));
          onSubChange("");
          toast({ title: "Category added" });
        },
        onError: (e: unknown) =>
          toast({ title: "Could not add category", description: String(e), variant: "destructive" }),
      },
    );
  };

  const handleAddSub = () => {
    const n = newSubName.trim();
    const ppid = parseInt(subParentId || parentCategoryId, 10);
    if (!Number.isFinite(ppid)) {
      toast({ title: "Select a parent category", variant: "destructive" });
      return;
    }
    if (!n) {
      toast({ title: "Enter a subcategory name", variant: "destructive" });
      return;
    }
    createCategory.mutate(
      { data: { name: n, parentId: ppid } },
      {
        onSuccess: (created) => {
          setNewSubName("");
          onParentChange(String(ppid));
          onSubChange(String(created.id));
          toast({ title: "Subcategory added" });
        },
        onError: (e: unknown) =>
          toast({ title: "Could not add subcategory", description: String(e), variant: "destructive" }),
      },
    );
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        <div className="space-y-2 min-w-0">
          <Label className="font-semibold">Category *</Label>
          <Select
            key={`parent-${parentCategoryId}-${rootsKey}`}
            value={parentCategoryId || undefined}
            onValueChange={handleParentSelectChange}
          >
            <SelectTrigger className="h-11 rounded-lg border-border/80 bg-white">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {roots.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
              {canManageCategories && (
                <>
                  <SelectSeparator />
                  <SelectItem value="__manage__" className="gap-2">
                    <span className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4 shrink-0 opacity-70" />
                      Manage categories…
                    </span>
                  </SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 min-w-0">
          <Label className="font-semibold">Subcategory</Label>
          {subcategories.length > 0 ? (
            <Select
              key={`sub-${parentCategoryId}-${subCategoryId}-${rootsKey}`}
              value={subCategoryId ? subCategoryId : "__none__"}
              onValueChange={(v) => onSubChange(v === "__none__" ? "" : v)}
              disabled={!parentCategoryId}
            >
              <SelectTrigger className="h-11 rounded-lg border-border/80 bg-white">
                <SelectValue placeholder="Choose a subcategory" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">General (whole category)</SelectItem>
                {subcategories.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select disabled value={undefined}>
              <SelectTrigger className="h-11 rounded-lg border-border/80 bg-white">
                <SelectValue
                  placeholder={
                    parentCategoryId ? "No subcategories for this category" : "Select a category first"
                  }
                />
              </SelectTrigger>
            </Select>
          )}
        </div>
      </div>

      {canManageCategories && (
        <Sheet open={manageOpen} onOpenChange={setManageOpen}>
          <SheetContent side="top" className="max-h-[min(85vh,520px)] overflow-y-auto rounded-b-xl px-6 pb-6 pt-14 sm:max-w-xl sm:mx-auto">
            <SheetHeader className="space-y-1 text-left pb-4 border-b border-border/60">
              <SheetTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 shrink-0 text-muted-foreground" />
                Manage categories
              </SheetTitle>
              <SheetDescription>Add top-level categories and subcategories. They appear in the category picker when saved.</SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-6">
              <div>
                <Label className="text-sm font-medium">New top-level category</Label>
                <p className="text-xs text-muted-foreground mt-1">Creates a root category shown in the list.</p>
                <div className="flex gap-2 mt-2">
                  <Input
                    value={newRootName}
                    onChange={(e) => setNewRootName(e.target.value)}
                    placeholder="e.g. Living Room"
                    className="h-10 rounded-lg"
                  />
                  <Button type="button" className="shrink-0" onClick={handleAddRoot} disabled={createCategory.isPending}>
                    Add
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">New subcategory</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">Nest under an existing category.</p>
                <Select value={subParentId || parentCategoryId || undefined} onValueChange={setSubParentId}>
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue placeholder="Parent category" />
                  </SelectTrigger>
                  <SelectContent>
                    {roots.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2 mt-3">
                  <Input
                    value={newSubName}
                    onChange={(e) => setNewSubName(e.target.value)}
                    placeholder="e.g. Sofas"
                    className="h-10 rounded-lg flex-1"
                  />
                  <Button type="button" className="shrink-0" onClick={handleAddSub} disabled={createCategory.isPending}>
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}

/** Split stored product category into parent + sub form fields (uses `category` from API when present). */
export function splitCategoryForForm(
  product: {
    categoryId?: number | null;
    category?: { id: number; parentId?: number | null } | null;
  },
  roots: CategoryRoot[] = [],
): { parentCategoryId: string; subCategoryId: string } {
  const cat = product.category;
  if (cat != null && cat.id != null) {
    if (cat.parentId != null && cat.parentId !== 0) {
      return { parentCategoryId: String(cat.parentId), subCategoryId: String(cat.id) };
    }
    return { parentCategoryId: String(cat.id), subCategoryId: "" };
  }

  const cid = product.categoryId;
  if (cid == null) {
    return { parentCategoryId: "", subCategoryId: "" };
  }

  // Avoid mapping leaf id to parent before the category tree is loaded (edit form flash / empty select).
  if (roots.length === 0) {
    return { parentCategoryId: "", subCategoryId: "" };
  }

  for (const r of roots) {
    if (r.id === cid) {
      return { parentCategoryId: String(r.id), subCategoryId: "" };
    }
    const sub = r.children?.find((c) => c.id === cid);
    if (sub) {
      return { parentCategoryId: String(r.id), subCategoryId: String(sub.id) };
    }
  }

  return { parentCategoryId: String(cid), subCategoryId: "" };
}

/** Resolve API `categoryId`: subcategory if selected and valid child of parent, else parent. */
export function resolveLeafCategoryId(
  parentCategoryId: string,
  subCategoryId: string,
  roots: CategoryRoot[],
): number | undefined {
  const pid = parseInt(parentCategoryId, 10);
  if (!Number.isFinite(pid)) return undefined;
  if (!subCategoryId) return pid;
  const sid = parseInt(subCategoryId, 10);
  if (!Number.isFinite(sid)) return pid;
  const parent = roots.find((r) => r.id === pid);
  if (parent?.children?.some((c) => c.id === sid)) return sid;
  return pid;
}
