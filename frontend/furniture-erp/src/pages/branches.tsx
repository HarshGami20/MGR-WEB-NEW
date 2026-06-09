import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTablePaginationFooter } from "@/components/data-table";
import {
  useListBranches,
  useCreateBranch,
  useUpdateBranch,
  useDeleteBranch,
  useToggleBranchActive,
  getListBranchesQueryKey,
} from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { branchFormSchema, type BranchFormValues } from "@/lib/form-validation";
import { ValidatedInput } from "@/components/validated-input";
import { usePermissions } from "@/lib/permissions";

const branchSchema = branchFormSchema;

const emptyForm: BranchFormValues = {
  name: "",
  code: "",
  address: "",
  city: "",
  state: "",
  phone: "",
  email: "",
};

export default function Branches() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { can } = usePermissions();
  const canAdd = can("branches", "add");
  const canEdit = can("branches", "edit");
  const canDelete = can("branches", "delete");
  const hasRowActions = canEdit || canDelete;

  const { data: branchesData, isLoading } = useListBranches({
    search: search || undefined,
    page,
    limit: 15,
  });

  const createBranch = useCreateBranch({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBranchesQueryKey() });
        toast({ title: "Branch created successfully" });
        setIsDialogOpen(false);
      },
      onError: (e: any) => toast({ title: "Error", description: e.data?.error || e.message, variant: "destructive" }),
    },
  });

  const updateBranch = useUpdateBranch({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBranchesQueryKey() });
        toast({ title: "Branch updated successfully" });
        setIsDialogOpen(false);
      },
      onError: (e: any) => toast({ title: "Error", description: e.data?.error || e.message, variant: "destructive" }),
    },
  });

  const deleteBranch = useDeleteBranch({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBranchesQueryKey() });
        toast({ title: "Branch deleted" });
      },
      onError: (e: any) => toast({ title: "Error", description: e.data?.error || e.message, variant: "destructive" }),
    },
  });

  const toggleActive = useToggleBranchActive({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBranchesQueryKey() });
        toast({ title: "Branch status updated" });
      },
    },
  });

  const form = useForm<BranchFormValues>({
    resolver: zodResolver(branchSchema),
    defaultValues: emptyForm,
  });

  const openCreateDialog = () => {
    setEditingId(null);
    form.reset(emptyForm);
    setIsDialogOpen(true);
  };

  const openEditDialog = (branch: any) => {
    setEditingId(branch.id);
    form.reset({
      name: branch.name,
      code: branch.code,
      address: branch.address || "",
      city: branch.city || "",
      state: branch.state || "",
      phone: branch.phone || "",
      email: branch.email || "",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: BranchFormValues) => {
    const payload = {
      ...data,
      address: data.address || null,
      city: data.city || null,
      state: data.state || null,
      phone: data.phone || null,
      email: data.email || null,
    };
    if (editingId) {
      updateBranch.mutate({ id: editingId, data: payload });
    } else {
      createBranch.mutate({ data: payload });
    }
  };

  const handleDelete = (id: number) => {
    if (
      confirm(
        "Delete this branch? It can only be removed after all product stock at this location is cleared or transferred. Users assigned to this branch will lose their assignment.",
      )
    ) {
      deleteBranch.mutate({ id });
    }
  };

  const branches = branchesData?.data ?? [];

  const columns = useMemo<ColumnDef<(typeof branches)[number]>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => (
          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{row.original.code}</span>
        ),
      },
      {
        id: "cityState",
        header: "City / State",
        cell: ({ row }) =>
          [row.original.city, row.original.state].filter(Boolean).join(", ") || "—",
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => row.original.phone || "—",
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => <span className="text-sm">{row.original.email || "—"}</span>,
      },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }) =>
          row.original.isActive ? (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>
          ) : (
            <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">Inactive</Badge>
          ),
      },
      ...(hasRowActions
        ? [
            {
              id: "actions",
              header: () => <span className="sr-only">Actions</span>,
              meta: { headerClassName: "w-[140px]", cellClassName: "text-right" },
              cell: ({ row }) => {
                const branch = row.original;
                return (
                  <div className="flex items-center justify-end gap-1">
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title={branch.isActive ? "Deactivate" : "Activate"}
                        onClick={() => toggleActive.mutate({ id: branch.id })}
                      >
                        {branch.isActive ? (
                          <ToggleRight className="h-4 w-4 text-green-600" />
                        ) : (
                          <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    )}
                    {canEdit && (
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(branch)}>
                        <Edit className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(branch.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                );
              },
            } as ColumnDef<(typeof branches)[number]>,
          ]
        : []),
    ],
    [openEditDialog, handleDelete, toggleActive.mutate, canEdit, canDelete, hasRowActions],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Branches</h2>
          <p className="text-muted-foreground">Manage your business locations and branches</p>
        </div>
        {canAdd && (
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add Branch
          </Button>
        )}
      </div>

      <div className="flex items-center bg-card p-4 rounded-lg border">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or code..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <DataTable
          columns={columns}
          data={branches}
          isLoading={isLoading}
          emptyMessage="No branches found."
          footer={<DataTablePaginationFooter page={page} total={branchesData?.total ?? 0} limit={branchesData?.limit ?? 10} onPageChange={setPage} itemLabel="branches" />}
        />
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Branch" : "Add Branch"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Branch Name *</FormLabel>
                      <FormControl><ValidatedInput field={field} rule="branchName" placeholder="e.g. Head Office" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Branch Code *</FormLabel>
                      <FormControl><ValidatedInput field={field} rule="branchCode" placeholder="e.g. HO-001" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl><ValidatedInput field={field} rule="address" placeholder="Street, city, state, pincode" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl><ValidatedInput field={field} rule="city" placeholder="e.g. Mumbai" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl><ValidatedInput field={field} rule="state" placeholder="e.g. Maharashtra" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl><ValidatedInput field={field} rule="mobile" placeholder="10-digit mobile" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input type="email" {...field} value={field.value || ""} placeholder="name@company.com" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createBranch.isPending || updateBranch.isPending}>
                  {editingId ? "Update Branch" : "Create Branch"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
