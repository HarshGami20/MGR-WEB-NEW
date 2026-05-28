import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import {
  useListCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  getListCategoriesQueryKey,
} from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, FolderTree } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { categoryFormSchema, type CategoryFormValues } from "@/lib/form-validation";
import { ValidatedInput } from "@/components/validated-input";
import { usePermissions } from "@/lib/permissions";
import { formatErrorMessage } from "@/lib/error-message";
import type { CategoryRoot } from "@/components/category-picker-with-manage";
import { flattenCategoryTree, rootCategoriesOnly, type FlatCategoryRow } from "@/lib/category-tree";
import { Badge } from "@/components/ui/badge";

type CreateMode = "main" | "sub";

export default function Categories() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>("main");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FlatCategoryRow | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { can } = usePermissions();
  const canManage = can("categories", "add") || can("categories", "edit");
  const canDelete = can("categories", "delete");

  const { data: categoriesData, isLoading } = useListCategories();

  const roots = useMemo(
    () => (Array.isArray(categoriesData) ? (categoriesData as CategoryRoot[]) : []),
    [categoriesData],
  );

  const flatCategories = useMemo(() => flattenCategoryTree(roots), [roots]);
  const parentOptions = useMemo(() => rootCategoriesOnly(roots, editingId), [roots, editingId]);
  const hasMainCategories = roots.length > 0;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });

  const createCategory = useCreateCategory({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Category created" });
        setIsDialogOpen(false);
      },
      onError: (e: unknown) =>
        toast({ title: "Could not create category", description: formatErrorMessage(e), variant: "destructive" }),
    },
  });

  const updateCategory = useUpdateCategory({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Category updated" });
        setIsDialogOpen(false);
      },
      onError: (e: unknown) =>
        toast({ title: "Could not update category", description: formatErrorMessage(e), variant: "destructive" }),
    },
  });

  const deleteCategory = useDeleteCategory({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Category deleted" });
        setDeleteTarget(null);
      },
      onError: (e: unknown) =>
        toast({ title: "Could not delete category", description: formatErrorMessage(e), variant: "destructive" }),
    },
  });

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: "", parentId: null },
  });

  const openCreateMainDialog = useCallback(() => {
    setEditingId(null);
    setCreateMode("main");
    form.reset({ name: "", parentId: null });
    setIsDialogOpen(true);
  }, [form]);

  const openCreateSubDialog = useCallback(
    (parentId?: number) => {
      setEditingId(null);
      setCreateMode("sub");
      const defaultParent = parentId ?? roots[0]?.id ?? null;
      form.reset({ name: "", parentId: defaultParent });
      setIsDialogOpen(true);
    },
    [form, roots],
  );

  const openEditDialog = useCallback(
    (row: FlatCategoryRow) => {
      setEditingId(row.id);
      setCreateMode(row.level > 0 ? "sub" : "main");
      form.reset({
        name: row.name,
        parentId: row.level > 0 ? row.parentId : null,
      });
      setIsDialogOpen(true);
    },
    [form],
  );

  const onSubmit = (data: CategoryFormValues) => {
    const isMain =
      editingId != null
        ? createMode === "main"
        : createMode === "main";
    const payload = {
      name: data.name.trim(),
      parentId: isMain ? null : (data.parentId ?? null),
    };
    if (!isMain && payload.parentId == null) {
      form.setError("parentId", { message: "Select a main category for this subcategory" });
      return;
    }
    if (editingId) {
      updateCategory.mutate({ id: editingId, data: payload });
    } else {
      createCategory.mutate({ data: payload });
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteCategory.mutate({ id: deleteTarget.id });
  };

  const dialogTitle =
    editingId != null
      ? createMode === "main"
        ? "Edit main category"
        : "Edit subcategory"
      : createMode === "main"
        ? "Add main category"
        : "Add subcategory";

  const dialogDescription =
    editingId != null
      ? createMode === "main"
        ? "Main categories appear at the top level in product and filter lists."
        : "Change the name or move this subcategory under another main category."
      : createMode === "main"
        ? "Create a new top-level category (e.g. Living Room, Bedroom)."
        : "Add a subcategory under an existing main category (e.g. Sofas under Living Room).";

  const columns = useMemo<ColumnDef<FlatCategoryRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div style={{ paddingLeft: `${row.original.level * 20}px` }} className="flex items-center gap-2 min-w-0">
            {row.original.level > 0 ? (
              <span className="text-muted-foreground shrink-0" aria-hidden>
                └
              </span>
            ) : null}
            <span className="font-medium truncate">{row.original.name}</span>
          </div>
        ),
      },
      {
        id: "type",
        header: "Type",
        meta: { headerClassName: "whitespace-nowrap", cellClassName: "whitespace-nowrap" },
        cell: ({ row }) =>
          row.original.level === 0 ? (
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
              Main category
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-muted/50 text-muted-foreground">
              Subcategory
            </Badge>
          ),
      },
      {
        id: "parent",
        header: "Parent",
        meta: { cellClassName: "text-muted-foreground text-sm" },
        cell: ({ row }) => row.original.parentName ?? "—",
      },
      {
        id: "children",
        header: "Subcategories",
        meta: { headerClassName: "text-right whitespace-nowrap", cellClassName: "text-right tabular-nums text-sm" },
        cell: ({ row }) => (row.original.level === 0 ? row.original.childCount : "—"),
      },
      ...(canManage || canDelete
        ? [
            {
              id: "actions",
              header: () => <span className="sr-only">Actions</span>,
              meta: { headerClassName: "w-[140px]", cellClassName: "text-right" },
              cell: ({ row }: { row: { original: FlatCategoryRow } }) => {
                const r = row.original;
                return (
                  <div className="flex items-center justify-end gap-1">
                    {canManage && r.level === 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => openCreateSubDialog(r.id)}
                      >
                        Add sub
                      </Button>
                    ) : null}
                    {canManage ? (
                      <Button type="button" variant="ghost" size="icon" onClick={() => openEditDialog(r)}>
                        <Edit className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button type="button" variant="ghost" size="icon" onClick={() => setDeleteTarget(r)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    ) : null}
                  </div>
                );
              },
            } as ColumnDef<FlatCategoryRow>,
          ]
        : []),
    ],
    [canManage, canDelete, openCreateSubDialog, openEditDialog],
  );

  const editingRow = editingId != null ? flatCategories.find((r) => r.id === editingId) : null;
  const editingHasChildren = (editingRow?.childCount ?? 0) > 0;
  const showParentField = editingId != null ? createMode === "sub" : createMode === "sub";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Categories</h2>
          <p className="text-muted-foreground">
            Add <span className="font-medium text-foreground">main categories</span> first, then add subcategories
            under them.
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={openCreateMainDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add main category
            </Button>
            <Button
              variant="outline"
              onClick={() => openCreateSubDialog()}
              disabled={!hasMainCategories}
              title={!hasMainCategories ? "Create a main category first" : undefined}
            >
              <FolderTree className="mr-2 h-4 w-4" />
              Add subcategory
            </Button>
          </div>
        ) : null}
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <DataTable
          columns={columns}
          data={flatCategories}
          isLoading={isLoading}
          emptyMessage={
            canManage
              ? "No categories yet. Click “Add main category” above to create your first top-level category."
              : "No categories found."
          }
          getRowId={(row) => String(row.id)}
        />
        {!isLoading && flatCategories.length === 0 && canManage ? (
          <div className="flex justify-center border-t px-4 py-6">
            <Button onClick={openCreateMainDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add main category
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{createMode === "main" && !editingId ? "Main category name" : "Name"}</FormLabel>
                    <FormControl>
                      <ValidatedInput
                        field={field}
                        rule="categoryName"
                        placeholder={createMode === "main" ? "e.g. Living Room" : "e.g. Sofas"}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {showParentField ? (
                <FormField
                  control={form.control}
                  name="parentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Main category *</FormLabel>
                      <Select
                        value={field.value?.toString() ?? ""}
                        onValueChange={(val) => field.onChange(parseInt(val, 10))}
                        disabled={editingHasChildren}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select main category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {parentOptions.map((c) => (
                            <SelectItem key={c.id} value={c.id.toString()}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {editingHasChildren ? (
                        <p className="text-xs text-muted-foreground">
                          Remove subcategories first before moving this under another main category.
                        </p>
                      ) : parentOptions.length === 0 ? (
                        <p className="text-xs text-destructive">Create a main category before adding subcategories.</p>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <p className="text-xs text-muted-foreground rounded-lg border bg-muted/30 px-3 py-2">
                  This will be a <span className="font-medium text-foreground">main (top-level)</span> category.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createCategory.isPending ||
                    updateCategory.isPending ||
                    (showParentField && parentOptions.length === 0)
                  }
                >
                  {editingId ? "Save changes" : createMode === "main" ? "Create main category" : "Create subcategory"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>?
                </p>
                {deleteTarget && deleteTarget.childCount > 0 ? (
                  <p className="text-destructive">
                    This category has {deleteTarget.childCount} subcategor
                    {deleteTarget.childCount === 1 ? "y" : "ies"}. Delete those first.
                  </p>
                ) : (
                  <p>Products using this category must be reassigned before deletion.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteCategory.isPending || (deleteTarget?.childCount ?? 0) > 0}
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
