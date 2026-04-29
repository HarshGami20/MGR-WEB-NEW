import { useState } from "react";
import { 
  useListUsers, 
  useCreateUser, 
  useUpdateUser, 
  useDeleteUser, 
  useToggleUserActive, 
  useListRoles,
  useListBranches,
  getListUsersQueryKey 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit, Trash2, Shield, Power, GitBranch } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";

const userSchema = z.object({
  name: z.string().min(1, "Name is required"),
  mobile: z.string().min(1, "Mobile is required"),
  email: z.string().email().optional().nullable().or(z.literal("")),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  roleId: z.coerce.number().min(1, "Role is required"),
  branchId: z.coerce.number().optional().nullable(),
});

type UserFormValues = z.infer<typeof userSchema>;

const emptyForm: UserFormValues = { name: "", mobile: "", email: "", password: "", roleId: 0, branchId: null };

export default function Users() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<number | undefined>();
  const [branchFilter, setBranchFilter] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: usersData, isLoading } = useListUsers({
    search: search || undefined,
    roleId: roleFilter,
    branchId: branchFilter,
    page,
    limit: 10,
  });

  const { data: rolesData } = useListRoles();
  const { data: branchesData } = useListBranches({ isActive: true, limit: 100 });

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
      roleId: user.roleId,
      branchId: user.branchId ?? null,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Users</h2>
          <p className="text-muted-foreground">Manage system users, roles, and branch assignments</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
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
          value={branchFilter?.toString() ?? "all"}
          onValueChange={(v) => setBranchFilter(v === "all" ? undefined : parseInt(v))}
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell>
              </TableRow>
            ) : usersData?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No users found.</TableCell>
              </TableRow>
            ) : (
              usersData?.data?.map((user: any) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.email || user.mobile}</div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{user.mobile}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="flex w-fit items-center gap-1">
                      <Shield className="h-3 w-3" />
                      {user.role?.name || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.branch ? (
                      <Badge variant="outline" className="flex w-fit items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        {user.branch.name}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.isActive ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Toggle Status" onClick={() => toggleUser.mutate({ id: user.id })}>
                        <Power className={`h-4 w-4 ${user.isActive ? "text-green-600" : "text-gray-400"}`} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(user)}>
                        <Edit className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => {
                        if (confirm("Delete this user?")) deleteUser.mutate({ id: user.id });
                      }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {usersData && usersData.total > usersData.limit && (
          <div className="p-4 border-t flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Page {page} · {usersData.total} total
            </span>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * usersData.limit >= usersData.total}>Next</Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
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
                <Button type="submit" disabled={createUser.isPending || updateUser.isPending}>
                  {editingId ? "Update User" : "Create User"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
