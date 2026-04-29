import { useState } from "react";
import { useListManufacturers, useCreateManufacturer, useUpdateManufacturer, useDeleteManufacturer, getListManufacturersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";

const manufacturerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  contactPerson: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  address: z.string().optional().nullable(),
  specialization: z.string().optional().nullable(),
});

type ManufacturerFormValues = z.infer<typeof manufacturerSchema>;

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

  const createManufacturer = useCreateManufacturer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListManufacturersQueryKey() });
        toast({ title: "Manufacturer created successfully" });
        setIsDialogOpen(false);
      },
    },
  });

  const updateManufacturer = useUpdateManufacturer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListManufacturersQueryKey() });
        toast({ title: "Manufacturer updated successfully" });
        setIsDialogOpen(false);
      },
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

  const form = useForm<ManufacturerFormValues>({
    resolver: zodResolver(manufacturerSchema),
    defaultValues: {
      name: "",
      contactPerson: "",
      mobile: "",
      email: "",
      address: "",
      specialization: "",
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
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: ManufacturerFormValues) => {
    if (editingId) {
      updateManufacturer.mutate({ id: editingId, data });
    } else {
      createManufacturer.mutate({ data });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this manufacturer?")) {
      deleteManufacturer.mutate({ id });
    }
  };

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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact Person</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Specialization</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell>
              </TableRow>
            ) : manufacturersData?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No manufacturers found.</TableCell>
              </TableRow>
            ) : (
              manufacturersData?.data?.map((manufacturer) => (
                <TableRow key={manufacturer.id}>
                  <TableCell className="font-medium">{manufacturer.name}</TableCell>
                  <TableCell>{manufacturer.contactPerson || "-"}</TableCell>
                  <TableCell>{manufacturer.mobile || "-"}</TableCell>
                  <TableCell>{manufacturer.specialization || "-"}</TableCell>
                  <TableCell>
                    {manufacturer.isActive ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(manufacturer)}>
                        <Edit className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(manufacturer.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        
        {manufacturersData && manufacturersData.total > manufacturersData.limit && (
          <div className="p-4 border-t flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Showing {(page - 1) * manufacturersData.limit + 1} to {Math.min(page * manufacturersData.limit, manufacturersData.total)} of {manufacturersData.total} manufacturers
            </span>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * manufacturersData.limit >= manufacturersData.total}>
                Next
              </Button>
            </div>
          </div>
        )}
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
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                        <Input {...field} value={field.value || ""} />
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
                        <Input {...field} value={field.value || ""} />
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
                        <Input type="email" {...field} value={field.value || ""} />
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
                      <FormLabel>Specialization (e.g. Wood, Metal)</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} />
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
                      <Input {...field} value={field.value || ""} />
                    </FormControl>
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