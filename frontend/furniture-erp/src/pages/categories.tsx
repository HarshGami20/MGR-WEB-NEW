import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { useListCategories, useCreateCategory, useUpdateCategory, useDeleteCategory, getListCategoriesQueryKey } from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2 } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { categoryFormSchema, type CategoryFormValues } from "@/lib/form-validation";
import { ValidatedInput } from "@/components/validated-input";

const categorySchema = categoryFormSchema;

export default function Categories() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: categoriesData, isLoading } = useListCategories();

  const createCategory = useCreateCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        toast({ title: "Category created successfully" });
        setIsDialogOpen(false);
      },
    },
  });

  const updateCategory = useUpdateCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        toast({ title: "Category updated successfully" });
        setIsDialogOpen(false);
      },
    },
  });

  const deleteCategory = useDeleteCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        toast({ title: "Category deleted successfully" });
      },
      onError: (e: any) => {
        toast({ title: "Error deleting category", description: e.message, variant: "destructive" });
      }
    },
  });

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: "",
      parentId: undefined,
    },
  });

  const openCreateDialog = () => {
    setEditingId(null);
    form.reset({ name: "", parentId: undefined });
    setIsDialogOpen(true);
  };

  const openEditDialog = (category: any) => {
    setEditingId(category.id);
    form.reset({ name: category.name, parentId: category.parentId });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: CategoryFormValues) => {
    if (editingId) {
      updateCategory.mutate({ id: editingId, data });
    } else {
      createCategory.mutate({ data });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this category?")) {
      deleteCategory.mutate({ id });
    }
  };

  const flattenCategories = (categories: any[] = [], level = 0): any[] => {
    let result: any[] = [];
    for (const cat of categories) {
      result.push({ ...cat, level });
      if (cat.children && cat.children.length > 0) {
        result = result.concat(flattenCategories(cat.children, level + 1));
      }
    }
    return result;
  };

  const flatCategories = flattenCategories((categoriesData as any) || []);

  const columns = useMemo<ColumnDef<(typeof flatCategories)[number]>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Category Name",
        cell: ({ row }) => (
          <div style={{ paddingLeft: `${row.original.level * 24}px` }} className="flex items-center">
            <span className="font-medium">{row.original.name}</span>
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { headerClassName: "w-[100px]", cellClassName: "text-right" },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="icon" onClick={() => openEditDialog(row.original)}>
              <Edit className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(row.original.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [openEditDialog, handleDelete],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Categories</h2>
          <p className="text-muted-foreground">Manage product categories</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Category
        </Button>
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <DataTable
          columns={columns}
          data={flatCategories}
          isLoading={isLoading}
          emptyMessage="No categories found."
          getRowId={(row) => String(row.id)}
        />
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Category" : "Add Category"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <ValidatedInput field={field} rule="categoryName" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="parentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parent Category</FormLabel>
                    <Select
                      value={field.value?.toString() || "none"}
                      onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="None (Top Level)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None (Top Level)</SelectItem>
                        {((categoriesData as any) as any[])
                          ?.filter((c: any) => c.id !== editingId)
                          .map((c: any) => (
                            <SelectItem key={c.id} value={c.id.toString()}>
                              {c.name}
                            </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createCategory.isPending || updateCategory.isPending}>
                  {editingId ? "Update Category" : "Create Category"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}