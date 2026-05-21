import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DataTable, DataTablePaginationFooter } from "@/components/data-table";
import { listDrivers, createDriver, updateDriver, deleteDriver, type Driver } from "@/lib/driver-api";
import { useAuth } from "@/lib/auth";
import { useBranch, assignedUserBranchIds } from "@/lib/branch-context";
import { usePermissions } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { zodFields } from "@/lib/form-validation";
import { ValidatedInput } from "@/components/validated-input";
import { Plus, Search, Eye, Pencil, Trash2 } from "lucide-react";

const DRIVER_VEHICLE_MAX = 200;
const DRIVER_NOTES_MAX = 500;

const driverSchema = z.object({
  name: zodFields.personName("Name"),
  mobile: zodFields.mobileOptional(),
  vehicleInfo: z
    .string()
    .trim()
    .max(DRIVER_VEHICLE_MAX, `Use at most ${DRIVER_VEHICLE_MAX} characters`)
    .optional(),
  notes: z
    .string()
    .trim()
    .max(DRIVER_NOTES_MAX, `Use at most ${DRIVER_NOTES_MAX} characters`)
    .optional(),
});

type DriverFormValues = z.infer<typeof driverSchema>;

export default function DriversPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedBranchId } = useBranch();
  const assigned = assignedUserBranchIds(user);
  const writeBranchId =
    assigned.length === 1
      ? assigned[0]!
      : assigned.length > 1
        ? selectedBranchId != null && assigned.includes(selectedBranchId)
          ? selectedBranchId
          : null
        : selectedBranchId;

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);

  const form = useForm<DriverFormValues>({
    resolver: zodResolver(driverSchema),
    defaultValues: {
      name: "",
      mobile: "",
      vehicleInfo: "",
      notes: "",
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["drivers", writeBranchId, search, page],
    queryFn: () =>
      listDrivers({
        branchId: writeBranchId ?? undefined,
        search: search || undefined,
        page,
        limit: 20,
        isActive: true,
      }),
    enabled: writeBranchId != null && can("deliveries", "view"),
  });

  const saveMut = useMutation({
    mutationFn: async (data: DriverFormValues) => {
      const body = {
        name: data.name.trim(),
        mobile: data.mobile?.trim() || null,
        vehicleInfo: data.vehicleInfo?.trim() || null,
        notes: data.notes?.trim() || null,
        branchId: writeBranchId,
      };
      if (editing) return updateDriver(editing.id, body);
      return createDriver(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      toast({ title: editing ? "Driver updated" : "Driver added" });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteDriver(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      toast({ title: "Driver deactivated" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: "", mobile: "", vehicleInfo: "", notes: "" });
    setDialogOpen(true);
  };

  const openEdit = (d: Driver) => {
    setEditing(d);
    form.reset({
      name: d.name,
      mobile: d.mobile ?? "",
      vehicleInfo: d.vehicleInfo ?? "",
      notes: d.notes ?? "",
    });
    setDialogOpen(true);
  };

  const onSubmit = (data: DriverFormValues) => {
    saveMut.mutate(data);
  };

  const columns = useMemo<ColumnDef<Driver>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Driver",
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.name}</p>
            {row.original.mobile ? (
              <p className="text-xs text-muted-foreground">{row.original.mobile}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: "vehicle",
        header: "Vehicle",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.vehicleInfo || "—"}</span>
        ),
      },
      {
        id: "deliveries",
        header: "Deliveries",
        cell: ({ row }) => (
          <span className="tabular-nums text-sm">{row.original.deliveryCount}</span>
        ),
      },
      {
        id: "payments",
        header: "Payments",
        cell: ({ row }) => (
          <span className="tabular-nums text-sm">{row.original.paymentCount}</span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { cellClassName: "text-right" },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => setLocation(`/drivers/${row.original.id}`)}>
              <Eye className="h-4 w-4" />
            </Button>
            {can("deliveries", "edit") && (
              <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {can("deliveries", "delete") && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteMut.mutate(row.original.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [can, deleteMut, setLocation],
  );

  if (writeBranchId == null) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
        Select a branch in the header to manage drivers.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Drivers</h1>
          <p className="text-sm text-muted-foreground">
            Delivery personnel, assigned deliveries, and driver payments.
          </p>
        </div>
        {can("deliveries", "add") && (
          <Button className="rounded-xl" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add driver
          </Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search drivers…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          emptyMessage="No drivers yet. Add your first delivery driver."
          footer={
            <DataTablePaginationFooter
              page={page}
              total={data?.total ?? 0}
              limit={data?.limit ?? 20}
              onPageChange={setPage}
              itemLabel="drivers"
            />
          }
        />
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit driver" : "Add driver"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <ValidatedInput field={field} rule="personName" placeholder="e.g. Rajesh Kumar" />
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
                    <FormLabel>Mobile</FormLabel>
                    <FormControl>
                      <ValidatedInput field={field} rule="mobile" placeholder="10-digit mobile" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vehicleInfo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vehicle</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        maxLength={DRIVER_VEHICLE_MAX}
                        placeholder="e.g. Van MH-12-AB-1234"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={2}
                        {...field}
                        value={field.value ?? ""}
                        maxLength={DRIVER_NOTES_MAX}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMut.isPending}>
                  {saveMut.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
