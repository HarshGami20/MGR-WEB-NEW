import { useState } from "react";
import { 
  useListUsers, 
  useCreateUser, 
  useUpdateUser, 
  useDeleteUser, 
  useToggleUserActive, 
  useListRoles,
  getListUsersQueryKey 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit, Trash2, Shield, Power } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";

const userSchema = z.object({
  name: z.string().min(1, "Name is required"),
  mobile: z.string().min(1, "Mobile is required"),
  email: z.string().email().optional().nullable().or(z.literal("")),
  password: z.string().min(6, "Password must be at least 6 characters").optional(), // Optional for editing
  roleId: z.coerce.number().min(1, "Role is required"),
});

type UserFormValues = z.infer<typeof userSchema>;

export default function Users() {
  const [search, setSearch] = useState("");
  const [roleId, setRoleId] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: usersData, isLoading } = useListUsers({
    search: search || undefined,
    roleId,
    page,
    limit: 10,
  });

  const { data: rolesData } = useListRoles();

  const createUser = useCreateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "User created successfully" });
        setIsDialogOpen(false);
      },
    },
  });

  const updateUser = useUpdateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "User updated successfully" });
        setIsDialogOpen(false);
      },
    },
  });

  const deleteUser = useDeleteUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "User deleted successfully" });
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
    defaultValues: {
      name: "",
      mobile: "",
      email: "",
      password: "",
      roleId: 0,
    },
  });

  const openCreateDialog = () => {
    setEditingId(null);
    form.reset({
      name: "",
      mobile: "",
      email: "",
      password: "",
      roleId: 0,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (user: any) => {
    setEditingId(user.id);
    form.reset({
      name: user.name,
      mobile: user.mobile,
      email: user.email || "",
      password: "", // Don't prefill password
      roleId: user.roleId,
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: UserFormValues) => {
    if (editingId) {
      // Don't send password if empty during edit
      const updateData = { ...data };
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

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this user?")) {
      deleteUser.mutate({ id });
    }
  };

  const handleToggleActive = (id: number) => {
    toggleUser.mutate({ id });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Users</h2>
          <p className="text-muted-foreground">Manage system users and their roles</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg border">
        <div className="flex flex-1 gap-4 items-center">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={roleId?.toString() || "all"}
            onValueChange={(val) => setRoleId(val === "all" ? undefined : parseInt(val))}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {rolesData?.data?.map((r: any) => (
                <SelectItem key={r.id} value={r.id.toString()}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
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
              usersData?.data?.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.mobile}</TableCell>
                  <TableCell>{user.email || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="flex w-fit items-center gap-1">
                      <Shield className="h-3 w-3" />
                      {user.role?.name || "Unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.isActive ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" title="Toggle Status" onClick={() => handleToggleActive(user.id)}>
                        <Power className={`h-4 w-4 ${user.isActive ? "text-green-600" : "text-gray-400"}`} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(user)}>
                        <Edit className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(user.id)}>
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
              Showing {(page - 1) * usersData.limit + 1} to {Math.min(page * usersData.limit, usersData.total)} of {usersData.total} users
            </span>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * usersData.limit >= usersData.total}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
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
                  name="mobile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mobile Number</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                          <SelectTrigger>
                            <SelectValue placeholder="Select Role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {rolesData?.data?.map((r: any) => (
                            <SelectItem key={r.id} value={r.id.toString()}>
                              {r.name}
                            </SelectItem>
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
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (Optional)</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{editingId ? "Reset Password (Optional)" : "Password"}</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
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