import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useToggleUserActive,
  useListRoles,
  useListBranches,
  useListSuppliers,
  useListManufacturers,
  getListUsersQueryKey,
} from "@/api-client";
import { useBranch } from "@/lib/branch-context";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit, Trash2, Shield, Power, GitBranch, Building2, Factory } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePermissions } from "@/lib/permissions";

const userSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    mobile: z.string().min(1, "Mobile is required"),
    email: z.string().email().optional().nullable().or(z.literal("")),
    password: z.string().min(6, "Password must be at least 6 characters").optional(),
    roleId: z.coerce.number().min(1, "Role is required"),
    branchId: z.coerce.number().optional().nullable(),
    supplierId: z.number().nullable().optional(),
    manufacturerId: z.number().nullable().optional(),
  })
  .refine((d) => !(d.supplierId != null && d.manufacturerId != null), {
    message: "Link a supplier or a manufacturer, not both.",
    path: ["manufacturerId"],
  });

type UserFormValues = z.infer<typeof userSchema>;

const emptyForm: UserFormValues = {
  name: "",
  mobile: "",
  email: "",
  password: "",
  roleId: 0,
  branchId: null,
  supplierId: null,
  manufacturerId: null,
};

export default function Users() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { can } = usePermissions();
  const { selectedBranchId, setSelectedBranchId } = useBranch();

  const { data: usersData, isLoading } = useListUsers({
    search: search || undefined,
    roleId: roleFilter,
    branchId: selectedBranchId ?? undefined,
    page,
    limit: 10,
  });

  const { data: rolesData } = useListRoles();
  const { data: branchesData } = useListBranches({ isActive: true, limit: 100 });
  const { data: suppliersData } = useListSuppliers({ limit: 200 });
  const { data: manufacturersData } = useListManufacturers({ limit: 200 });

  const createUser = useCreateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "User created successfully" });
        setIsDialogOpen(false);
      },
      onError: (e: any) => toast({ title: "Error", description: e.data?.error || e.message, variant: "destructive" }),
    },
  });

  const updateUser = useUpdateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "User updated successfully" });
        setIsDialogOpen(false);
      },
      onError: (e: any) => toast({ title: "Error", description: e.data?.error || e.message, variant: "destructive" }),
    },
  });

  const deleteUser = useDeleteUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "User deleted" });
      },
    },
  });

  const toggleUser = useToggleUserActive({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "User status updated" });
      },
    },
  });

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: emptyForm,
  });

  const openCreateDialog = () => {
    setEditingId(null);
    form.reset(emptyForm);
    setIsDialogOpen(true);
  };

  const openEditDialog = (user: any) => {
    setEditingId(user.id);
    form.reset({
      name: user.name,
      mobile: user.mobile,
      email: user.email || "",
      password: "",
      roleId: user.roleId ?? 0,
      branchId: user.branchId ?? null,
      supplierId: user.supplierId ?? null,
      manufacturerId: user.manufacturerId ?? null,
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: UserFormValues) => {
    if (editingId) {
      const updateData: any = { ...data };
      if (!updateData.password) delete updateData.password;
      updateUser.mutate({ id: editingId, data: updateData });
    } else {
      if (!data.password) {
        form.setError("password", { message: "Password is required for new users" });
        return;
      }
      createUser.mutate({ data: data as any });
    }
  };

  const users = usersData?.data ?? [];

  const columns = useMemo<ColumnDef<(typeof users)[number]>[]>(
    () => [
      {
        id: "nameCol",
        header: "Name",
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-9 w-9 rounded-full border border-border/60 shrink-0">
                <AvatarImage src={user.avatarUrl || avatarUrlForName(user.name)} alt={user.name} />
                <AvatarFallback className="text-xs bg-primary/12 text-primary font-semibold">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="font-medium truncate">{user.name}</div>
                <div className="text-xs text-muted-foreground truncate">{user.email || user.mobile}</div>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "mobile",
        header: "Mobile",
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.mobile}</span>
        ),
      },
      {
        id: "role",
        header: "Role",
        cell: ({ row }) => (
          <Badge variant="secondary" className="flex w-fit items-center gap-1">
            <Shield className="h-3 w-3" />
            {row.original.role?.name || "—"}
          </Badge>
        ),
      },
      {
        id: "branch",
        header: "Branch",
        cell: ({ row }) => {
          const b = row.original.branch;
          return b ? (
            <Badge variant="outline" className="flex w-fit items-center gap-1">
              <GitBranch className="h-3 w-3" />
              {b.name}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          );
        },
      },
      {
        id: "portal",
        header: "Portal",
        cell: ({ row }) => {
          const user = row.original;
          return user.supplier?.name ? (
            <Badge variant="outline" className="flex w-fit max-w-[200px] items-center gap-1">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{user.supplier.name}</span>
            </Badge>
          ) : user.manufacturer?.name ? (
            <Badge variant="outline" className="flex w-fit max-w-[200px] items-center gap-1">
              <Factory className="h-3 w-3 shrink-0" />
              <span className="truncate">{user.manufacturer.name}</span>
            </Badge>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          );
        },
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
        header: () => <span className="text-right block w-full">Actions</span>,
        meta: { headerClassName: "text-right", cellClassName: "text-right" },
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              {can("users", "edit") && (
                <Button variant="ghost" size="icon" title="Toggle Status" onClick={() => toggleUser.mutate({ id: user.id })}>
                  <Power className={`h-4 w-4 ${user.isActive ? "text-green-600" : "text-gray-400"}`} />
                </Button>
              )}
              {can("users", "edit") && (
                <Button variant="ghost" size="icon" onClick={() => openEditDialog(user)}>
                  <Edit className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
              {can("users", "delete") && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (confirm("Delete this user?")) deleteUser.mutate({ id: user.id });
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [can, toggleUser, deleteUser, openEditDialog],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Users</h2>
          <p className="text-muted-foreground">Manage system users, roles, and branch assignments</p>
        </div>
        {can("users", "add") && (
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-center bg-card p-4 rounded-lg border">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={roleFilter?.toString() ?? "all"}
          onValueChange={(v) => setRoleFilter(v === "all" ? undefined : parseInt(v))}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Filter by Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {(rolesData as any)?.data?.map((r: any) => (
              <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
            )) ?? (rolesData as any)?.map?.((r: any) => (
              <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={selectedBranchId?.toString() ?? "all"}
          onValueChange={(v) => setSelectedBranchId(v === "all" ? null : parseInt(v))}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Filter by Branch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branchesData?.data?.map((b: any) => (
              <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <DataTable
          columns={columns}
          data={users}
          isLoading={isLoading}
          emptyMessage="No users found."
          footer={
            usersData && usersData.total > usersData.limit ? (
              <div className="p-4 border-t flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Page {page} · {usersData.total} total
                </span>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * usersData.limit >= usersData.total}>Next</Button>
                </div>
              </div>
            ) : undefined
          }
        />
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit User" : "Add User"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="mobile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mobile Number</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (Optional)</FormLabel>
                      <FormControl><Input type="email" {...field} value={field.value || ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="roleId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select
                        value={field.value ? field.value.toString() : ""}
                        onValueChange={(val) => field.onChange(parseInt(val))}
                      >
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select Role" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {((rolesData as any)?.data ?? (rolesData as any))?.map?.((r: any) => (
                            <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="branchId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Branch</FormLabel>
                      <Select
                        value={field.value ? field.value.toString() : "none"}
                        onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))}
                      >
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select Branch" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No Branch</SelectItem>
                          {branchesData?.data?.map((b: any) => (
                            <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplier portal (optional)</FormLabel>
                      <Select
                        value={field.value != null ? field.value.toString() : "none"}
                        onValueChange={(val) => {
                          const next = val === "none" ? null : parseInt(val, 10);
                          field.onChange(next);
                          if (next != null) form.setValue("manufacturerId", null);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {suppliersData?.data?.map((s: any) => (
                            <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="manufacturerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Manufacturer portal (optional)</FormLabel>
                      <Select
                        value={field.value != null ? field.value.toString() : "none"}
                        onValueChange={(val) => {
                          const next = val === "none" ? null : parseInt(val, 10);
                          field.onChange(next);
                          if (next != null) form.setValue("supplierId", null);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {manufacturersData?.data?.map((m: any) => (
                            <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Links this login to procurement POs for that supplier or manufacturer. Only one link per user.
              </p>

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{editingId ? "Reset Password (leave blank to keep)" : "Password"}</FormLabel>
                    <FormControl><Input type="password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                {((editingId && can("users", "edit")) || (!editingId && can("users", "add"))) && (
                <Button type="submit" disabled={createUser.isPending || updateUser.isPending}>
                  {editingId ? "Update User" : "Create User"}
                </Button>
                )}
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function avatarUrlForName(name: string) {
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(name || "user")}&radius=50&backgroundColor=f8d1d1,cfe7b2,c8ccff,f5dfbf,bfe3ff,d9c6ff`;
}

function initials(name: string) {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
}
