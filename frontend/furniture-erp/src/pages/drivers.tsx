import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Eye, Pencil, Trash2 } from "lucide-react";

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
  const [formName, setFormName] = useState("");
  const [formMobile, setFormMobile] = useState("");
  const [formVehicle, setFormVehicle] = useState("");
  const [formNotes, setFormNotes] = useState("");

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
    mutationFn: async () => {
      const body = {
        name: formName.trim(),
        mobile: formMobile.trim() || null,
        vehicleInfo: formVehicle.trim() || null,
        notes: formNotes.trim() || null,
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
    setFormName("");
    setFormMobile("");
    setFormVehicle("");
    setFormNotes("");
    setDialogOpen(true);
  };

  const openEdit = (d: Driver) => {
    setEditing(d);
    setFormName(d.name);
    setFormMobile(d.mobile ?? "");
    setFormVehicle(d.vehicleInfo ?? "");
    setFormNotes(d.notes ?? "");
    setDialogOpen(true);
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
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Mobile</Label>
              <Input value={formMobile} onChange={(e) => setFormMobile(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Vehicle</Label>
              <Input
                value={formVehicle}
                onChange={(e) => setFormVehicle(e.target.value)}
                placeholder="e.g. Van MH-12-AB-1234"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!formName.trim() || saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
