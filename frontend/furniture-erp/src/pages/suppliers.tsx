import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTablePaginationFooter } from "@/components/data-table";
import { useListSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier, getListSuppliersQueryKey } from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { partnerContactSchema, type PartnerContactFormValues } from "@/lib/form-validation";
import { ValidatedInput } from "@/components/validated-input";

const supplierSchema = partnerContactSchema;
type SupplierFormValues = PartnerContactFormValues;

export default function Suppliers() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: suppliersData, isLoading } = useListSuppliers({
    search: search || undefined,
    page,
    limit: 10,
  });

  const createSupplier = useCreateSupplier({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
        toast({ title: "Supplier created successfully" });
        setIsDialogOpen(false);
      },
    },
  });

  const updateSupplier = useUpdateSupplier({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
        toast({ title: "Supplier updated successfully" });
        setIsDialogOpen(false);
      },
    },
  });

  const deleteSupplier = useDeleteSupplier({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
        toast({ title: "Supplier deleted successfully" });
      },
    },
  });

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: "",
      contactPerson: "",
      mobile: "",
      email: "",
      address: "",
      gstNumber: "",
    },
  });

  const openCreateDialog = () => {
    setEditingId(null);
    form.reset({
      name: "",
      contactPerson: "",
      mobile: "",
      email: "",
      address: "",
      gstNumber: "",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (supplier: any) => {
    setEditingId(supplier.id);
    form.reset({
      name: supplier.name,
      contactPerson: supplier.contactPerson || "",
      mobile: supplier.mobile || "",
      email: supplier.email || "",
      address: supplier.address || "",
      gstNumber: supplier.gstNumber || "",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: SupplierFormValues) => {
    if (editingId) {
      updateSupplier.mutate({ id: editingId, data });
    } else {
      createSupplier.mutate({ data });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this supplier?")) {
      deleteSupplier.mutate({ id });
    }
  };

  const suppliers = suppliersData?.data ?? [];

  const columns = useMemo<ColumnDef<(typeof suppliers)[number]>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: "contactPerson",
        header: "Contact Person",
        cell: ({ row }) => row.original.contactPerson || "—",
      },
      {
        accessorKey: "mobile",
        header: "Mobile",
        cell: ({ row }) => row.original.mobile || "—",
      },
      {
        accessorKey: "gstNumber",
        header: "GST Number",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.gstNumber || "—"}</span>
        ),
      },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }) =>
          row.original.isActive ? (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>
          ) : (
            <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">Inactive</Badge>
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
          <h2 className="text-2xl font-bold tracking-tight">Suppliers</h2>
          <p className="text-muted-foreground">Manage your product suppliers</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Supplier
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg border">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search suppliers..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <DataTable
          columns={columns}
          data={suppliers}
          isLoading={isLoading}
          emptyMessage="No suppliers found."
          footer={<DataTablePaginationFooter page={page} total={suppliersData?.total ?? 0} limit={suppliersData?.limit ?? 10} onPageChange={setPage} itemLabel="suppliers" />}
        />
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <ValidatedInput field={field} rule="companyName" placeholder="e.g. ABC Furniture Pvt Ltd" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="contactPerson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person</FormLabel>
                      <FormControl>
                        <ValidatedInput field={field} rule="personName" placeholder="e.g. Rahul Sharma" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mobile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mobile Number</FormLabel>
                      <FormControl>
                        <ValidatedInput field={field} rule="mobile" placeholder="10-digit mobile" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} value={field.value || ""} placeholder="name@company.com" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gstNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GST Number</FormLabel>
                      <FormControl>
                        <ValidatedInput field={field} rule="gstNumber" placeholder="15-character GSTIN" />
                      </FormControl>
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
                    <FormControl>
                      <ValidatedInput field={field} rule="address" placeholder="Street, city, state, pincode" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createSupplier.isPending || updateSupplier.isPending}>
                  {editingId ? "Update Supplier" : "Create Supplier"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}