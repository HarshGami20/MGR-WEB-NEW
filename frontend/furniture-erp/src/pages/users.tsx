import { useMemo, useState, useEffect, type ComponentProps } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTablePaginationFooter } from "@/components/data-table";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  deleteUser as deleteUserRequest,
  useToggleUserActive,
  useListRoles,
  useListBranches,
  getListUsersQueryKey,
  getListRolesQueryKey,
} from "@/api-client";
import { useBranch } from "@/lib/branch-context";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit, Trash2, Shield, Power, GitBranch } from "lucide-react";
import { z } from "zod";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { coerceRoleList, usePermissions } from "@/lib/permissions";
import { filterStaffAssignableRoles, filterStaffErpUsers } from "@/lib/role-policy";
import { userFormSchema, type UserFormValues } from "@/lib/form-validation";
import { ValidatedInput } from "@/components/validated-input";

const userSchema = userFormSchema;

function FormMessage({ className, ...props }: ComponentProps<typeof BaseFormMessage>) {
  return <BaseFormMessage className={cn("static mt-1", className)} {...props} />;
}

const emptyForm: UserFormValues = {
  name: "",
  mobile: "",
  email: "",
  password: "",
  roleId: 0,
  branchIds: [],
  isSales: false,
  ordersListScope: null,
};

export default function Users() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deletePassword, setDeletePassword] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { can } = usePermissions();
  const { user: actor } = useAuth();
  const { selectedBranchId, setSelectedBranchId } = useBranch();

  const { data: usersData, isLoading } = useListUsers({
    search: search || undefined,
    roleId: roleFilter,
    branchId: selectedBranchId ?? undefined,
    page,
    limit: 10,
  }, {
    query: { staleTime: 0 },
  });

  const { data: rolesData } = useListRoles({
    query: { staleTime: 0 },
  });
  const { data: branchesData } = useListBranches({ isActive: true, limit: 100 });

  const createUser = useCreateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "User created successfully" });
        setIsDialogOpen(false);
      },
      onError: (e: any) => handleUserMutationError(e, "create"),
    },
  });

  const updateUser = useUpdateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "User updated successfully" });
        setIsDialogOpen(false);
      },
      onError: (e: any) => handleUserMutationError(e, "update"),
    },
  });

  const deleteUser = useMutation({
    mutationFn: async ({ id, password }: { id: number; password: string }) =>
      deleteUserRequest(id, {
        body: JSON.stringify({ password }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: "User deleted" });
      setDeleteTarget(null);
      setDeletePassword("");
    },
    onError: (e: any) => {
      toast({
        title: "Could not delete user",
        description:
          e?.data?.error ?? e?.response?.data?.error ?? e?.message ?? "Please try again.",
        variant: "destructive",
      });
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

  function handleUserMutationError(e: any, action: "create" | "update") {
    const description: string =
      e?.data?.error ?? e?.response?.data?.error ?? e?.message ?? "Please try again.";
    const field = (e?.data?.field as string | undefined) || inferConflictField(description);
    const isConflict = e?.status === 409 || /already (exists|in use|registered)/i.test(description);
    if (isConflict && (field === "mobile" || field === "email")) {
      form.setError(field, { type: "server", message: description });
      form.setFocus(field);
      toast({
        title: "User already exists",
        description,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: action === "create" ? "Failed to create user" : "Failed to update user",
      description,
      variant: "destructive",
    });
  }

  const roleRows = useMemo(
    () => filterStaffAssignableRoles(coerceRoleList(rolesData) as { id: number; name: string }[], actor),
    [rolesData, actor],
  );
  const roleIdWatch = form.watch("roleId");
  const selectedRoleIsSuperAdmin = useMemo(() => {
    const r = roleRows.find((x) => x.id === roleIdWatch);
    return r?.name === "Super Admin";
  }, [roleIdWatch, roleRows]);

  useEffect(() => {
    if (selectedRoleIsSuperAdmin) {
      form.setValue("branchIds", [], { shouldDirty: true });
    }
  }, [selectedRoleIsSuperAdmin, form]);

  const openCreateDialog = () => {
    setEditingId(null);
    form.reset(emptyForm);
    setIsDialogOpen(true);
  };

  const openEditDialog = (user: { id?: number; roleId?: number | null; role?: { id?: number } | null; [key: string]: unknown }) => {
    const userId = Number(user.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      toast({
        title: "Cannot edit user",
        description: "User id is missing. Refresh the users list and try again.",
        variant: "destructive",
      });
      return;
    }
    const resolvedRoleId = Number(user.roleId ?? user.role?.id);
    setEditingId(userId);
    form.reset({
      name: String(user.name ?? ""),
      mobile: String(user.mobile ?? ""),
      email: (user.email as string) || "",
      password: "",
      roleId: Number.isFinite(resolvedRoleId) && resolvedRoleId > 0 ? resolvedRoleId : 0,
      branchIds: (() => {
        if (Array.isArray(user.branchIds) && user.branchIds.length > 0) return user.branchIds;
        const fromBranches = (user.branches as { id: number }[] | undefined)?.map((b) => b.id).filter(Boolean);
        if (fromBranches && fromBranches.length > 0) return fromBranches;
        if (user.branchId != null) return [user.branchId];
        return [];
      })(),
      isSales:
        user.isSales === true &&
        user.ordersListScope !== "all" &&
        user.ordersListScope !== null,
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: UserFormValues) => {
    const payload = {
      ...data,
      isSales: data.isSales,
      ordersListScope: data.isSales ? "own" : null,
    };
    if (editingId) {
      const roleExists = roleRows.some((r) => r.id === payload.roleId);
      if (!roleExists) {
        form.setError("roleId", {
          message: "Selected role is no longer valid. Refresh the page and try again.",
        });
        void queryClient.invalidateQueries({ queryKey: getListRolesQueryKey() });
        return;
      }
      const updateData: Record<string, unknown> = { ...payload };
      if (!updateData.password) delete updateData.password;
      updateUser.mutate({ id: editingId, data: updateData as any });
    } else {
      if (!payload.password) {
        form.setError("password", { message: "Password is required for new users" });
        return;
      }
      createUser.mutate({ data: payload as any });
    }
  };

  const users = useMemo(
    () => filterStaffErpUsers((usersData?.data ?? []) as Parameters<typeof filterStaffErpUsers>[0]),
    [usersData?.data],
  );

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
                <div className="text-xs text-muted-foreground truncate">{user.email || "N/A"}</div>
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
          const u = row.original as { role?: { name?: string }; branches?: { id: number; name: string }[]; branch?: { id: number; name: string } };
          if (u.role?.name === "Super Admin") {
            return (
              <Badge variant="outline" className="flex w-fit items-center gap-1 bg-primary/5 text-primary border-primary/20">
                <GitBranch className="h-3 w-3 shrink-0" />
                All branches
              </Badge>
            );
          }
          const list = (u.branches?.length ? u.branches : u.branch ? [u.branch] : []) as { id: number; name: string }[];
          return list.length > 0 ? (
            <div className="flex flex-wrap gap-1 max-w-[220px]">
              {list.map((b) => (
                <Badge key={b.id} variant="outline" className="flex w-fit items-center gap-1 shrink-0">
                  <GitBranch className="h-3 w-3" />
                  <span className="truncate max-w-[120px]">{b.name}</span>
                </Badge>
              ))}
            </div>
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
                    setDeletePassword("");
                    setDeleteTarget({ id: user.id, name: user.name });
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
          <p className="text-muted-foreground">
            Manage ERP staff users, roles, and branch assignments. Supplier and manufacturer portal logins are managed from Procurement.
          </p>
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
            {roleRows.map((r) => (
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
          footer={<DataTablePaginationFooter page={page} total={usersData?.total ?? 0} limit={usersData?.limit ?? 10} onPageChange={setPage} itemLabel="users" />}
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
                    <FormControl><ValidatedInput field={field} rule="personName" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="mobile"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Mobile Number</FormLabel>
                      <FormControl>
                        <ValidatedInput
                          field={{
                            value: field.value,
                            onChange: (value) => {
                              if (fieldState.error?.type === "server") {
                                form.clearErrors("mobile");
                              }
                              field.onChange(value);
                            },
                          }}
                          rule="mobile"
                          aria-invalid={!!fieldState.error}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Email (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          {...field}
                          value={field.value || ""}
                          aria-invalid={!!fieldState.error}
                          onChange={(e) => {
                            if (fieldState.error?.type === "server") {
                              form.clearErrors("email");
                            }
                            field.onChange(e);
                          }}
                        />
                      </FormControl>
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
                          {roleRows.map((r) => (
                            <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="branchIds"
                render={() => (
                  <FormItem>
                    <FormLabel>Branches</FormLabel>
                    {selectedRoleIsSuperAdmin ? (
                      <p className="text-sm text-muted-foreground rounded-md border border-dashed border-primary/25 bg-primary/5 px-3 py-2">
                        Super Admin has access to every branch. You do not need to assign branches.
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground mb-2">Select all branches this user may access.</p>
                        <div className="rounded-md border p-3 max-h-44 overflow-y-auto space-y-2">
                          {(branchesData?.data ?? []).length === 0 ? (
                            <p className="text-sm text-muted-foreground">No branches available.</p>
                          ) : (
                            (branchesData?.data ?? []).map((b: { id: number; name: string }) => (
                              <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  checked={form.watch("branchIds").includes(b.id)}
                                  onCheckedChange={(c) => {
                                    const cur = form.getValues("branchIds") ?? [];
                                    if (c === true) {
                                      form.setValue("branchIds", [...new Set([...cur, b.id])], { shouldDirty: true, shouldValidate: true });
                                    } else {
                                      form.setValue(
                                        "branchIds",
                                        cur.filter((x: number) => x !== b.id),
                                        { shouldDirty: true, shouldValidate: true },
                                      );
                                    }
                                  }}
                                />
                                <span>{b.name}</span>
                              </label>
                            ))
                          )}
                        </div>
                      </>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isSales"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Sales user</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        When on, this user only sees orders they created or are assigned to. When off, they see all
                        orders (subject to role permissions).
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

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

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeletePassword("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `This will permanently remove ${deleteTarget.name}. Enter your password to confirm.`
                : "Enter your password to confirm."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <label htmlFor="delete-user-password" className="text-sm font-medium">
              Your password
            </label>
            <Input
              id="delete-user-password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUser.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!deletePassword.trim() || deleteUser.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                deleteUser.mutate({ id: deleteTarget.id, password: deletePassword });
              }}
            >
              {deleteUser.isPending ? "Deleting…" : "Delete user"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function inferConflictField(message: string): "mobile" | "email" | null {
  const lower = (message || "").toLowerCase();
  if (lower.includes("mobile")) return "mobile";
  if (lower.includes("email")) return "email";
  return null;
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
