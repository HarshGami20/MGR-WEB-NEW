import { useMemo, useState, type ComponentProps } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTablePaginationFooter } from "@/components/data-table";
import { useListManufacturers, useCreateManufacturer, useUpdateManufacturer, useDeleteManufacturer, getListManufacturersQueryKey } from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage as BaseFormMessage,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  manufacturerWithPortalSchema,
  type ManufacturerWithPortalFormValues,
} from "@/lib/form-validation";
import { ValidatedInput } from "@/components/validated-input";

function FormMessage({ className, ...props }: ComponentProps<typeof BaseFormMessage>) {
  return <BaseFormMessage className={cn("static mt-1", className)} {...props} />;
}

const manufacturerSchema = manufacturerWithPortalSchema;
type ManufacturerPortalFormValues = ManufacturerWithPortalFormValues;

export default function Manufacturers() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: manufacturersData, isLoading } = useListManufacturers({
    search: search || undefined,
    page,
    limit: 10,
  });

  function handleManufacturerMutationError(e: any, action: "create" | "update") {
    const description: string =
      e?.data?.error ??
      e?.response?.data?.error ??
      e?.message ??
      "Please try again.";
    const field = (e?.data?.field as string | undefined) ?? inferConflictField(description);
    const isConflict =
      e?.status === 409 || /already (exists|in use|registered)/i.test(description);
    if (isConflict && (field === "mobile" || field === "email")) {
      form.setError(field as "mobile" | "email", { type: "server", message: description });
      form.setFocus(field as "mobile" | "email");
      toast({
        title: "Manufacturer conflict",
        description,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: action === "create" ? "Failed to create manufacturer" : "Failed to update manufacturer",
      description,
      variant: "destructive",
    });
  }

  const createManufacturer = useCreateManufacturer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListManufacturersQueryKey() });
        toast({ title: "Manufacturer created successfully" });
        setIsDialogOpen(false);
      },
      onError: (e: any) => handleManufacturerMutationError(e, "create"),
    },
  });

  const updateManufacturer = useUpdateManufacturer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListManufacturersQueryKey() });
        toast({ title: "Manufacturer updated successfully" });
        setIsDialogOpen(false);
      },
      onError: (e: any) => handleManufacturerMutationError(e, "update"),
    },
  });

  const deleteManufacturer = useDeleteManufacturer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListManufacturersQueryKey() });
        toast({ title: "Manufacturer deleted successfully" });
      },
    },
  });

  const form = useForm<ManufacturerPortalFormValues>({
    resolver: zodResolver(manufacturerSchema),
    defaultValues: {
      name: "",
      contactPerson: "",
      mobile: "",
      email: "",
      address: "",
      specialization: "",
      portalPassword: "",
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
      specialization: "",
      portalPassword: "",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (manufacturer: any) => {
    setEditingId(manufacturer.id);
    form.reset({
      name: manufacturer.name,
      contactPerson: manufacturer.contactPerson || "",
      mobile: manufacturer.mobile || "",
      email: manufacturer.email || "",
      address: manufacturer.address || "",
      specialization: manufacturer.specialization || "",
      portalPassword: "",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: ManufacturerPortalFormValues) => {
    const portalPassword = data.portalPassword?.trim() ?? "";
    const mobile = (data.mobile ?? "").trim();

    if (!editingId) {
      if (!portalPassword) {
        form.setError("portalPassword", { message: "Manufacturer portal password is required" });
        return;
      }
      if (!mobile) {
        form.setError("mobile", { message: "Mobile is required to create the portal login" });
        return;
      }
    } else if (portalPassword && !mobile) {
      form.setError("mobile", { message: "Mobile is required to reset the portal login" });
      return;
    }

    const payload = {
      ...data,
      portalPassword: portalPassword || undefined,
    };

    if (editingId) {
      updateManufacturer.mutate({ id: editingId, data: payload as any });
    } else {
      createManufacturer.mutate({ data: payload as any });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this manufacturer?")) {
      deleteManufacturer.mutate({ id });
    }
  };

  const manufacturers = manufacturersData?.data ?? [];

  const columns = useMemo<ColumnDef<(typeof manufacturers)[number]>[]>(
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
        accessorKey: "specialization",
        header: "Specialization",
        cell: ({ row }) => row.original.specialization || "—",
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
          <h2 className="text-2xl font-bold tracking-tight">Manufacturers</h2>
          <p className="text-muted-foreground">Manage your custom furniture manufacturers</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Manufacturer
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg border">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search manufacturers..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <DataTable
          columns={columns}
          data={manufacturers}
          isLoading={isLoading}
          emptyMessage="No manufacturers found."
          footer={<DataTablePaginationFooter page={page} total={manufacturersData?.total ?? 0} limit={manufacturersData?.limit ?? 10} onPageChange={setPage} itemLabel="manufacturers" />}
        />
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Manufacturer" : "Add Manufacturer"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name*</FormLabel>
                    <FormControl>
                      <ValidatedInput field={field} rule="companyName" placeholder="e.g. Premium Wood Works" />
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
                  name="specialization"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Specialization</FormLabel>
                      <FormControl>
                        <ValidatedInput field={field} rule="plainText" placeholder="e.g. Wood, Metal, Upholstery" />
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

              <FormField
                control={form.control}
                name="portalPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {editingId ? "Manufacturer Portal Password (optional reset)" : "Manufacturer Portal Password*"}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        {...field}
                        value={field.value || ""}
                        placeholder={editingId ? "Leave blank to keep current password" : "Set manufacturer portal password"}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {editingId
                        ? "If provided, this will reset the linked manufacturer portal user password."
                        : "This creates the direct manufacturer portal login from Procurement."}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createManufacturer.isPending || updateManufacturer.isPending}>
                  {editingId ? "Update Manufacturer" : "Create Manufacturer"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function inferConflictField(message: string): "mobile" | "email" | null {
  const lower = (message || "").toLowerCase();
  if (lower.includes("mobile")) return "mobile";
  if (lower.includes("email")) return "email";
  return null;
}