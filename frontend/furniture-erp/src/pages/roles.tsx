import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { 
  useListRoles, 
  useCreateRole, 
  useUpdateRole, 
  useDeleteRole, 
  getListRolesQueryKey 
} from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2 } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PERMISSION_MODULES,
  coerceRoleList,
  countGrantedPermissions,
  emptyPermissionsMatrix,
  permissionsToFormMatrix,
  usePermissions,
} from "@/lib/permissions";

const permissionSetSchema = z.object({
  view: z.boolean(),
  add: z.boolean(),
  edit: z.boolean(),
  delete: z.boolean(),
});

const roleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  permissions: z.record(z.string(), permissionSetSchema),
});

type RoleFormValues = z.infer<typeof roleSchema>;

const DEFAULT_PERMISSIONS = emptyPermissionsMatrix();

export default function Roles() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { can } = usePermissions();

  const { data: rolesData, isLoading } = useListRoles();

  const createRole = useCreateRole({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRolesQueryKey() });
        toast({ title: "Role created successfully" });
        setIsDialogOpen(false);
      },
    },
  });

  const updateRole = useUpdateRole({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRolesQueryKey() });
        toast({ title: "Role updated successfully" });
        setIsDialogOpen(false);
      },
    },
  });

  const deleteRole = useDeleteRole({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRolesQueryKey() });
        toast({ title: "Role deleted successfully" });
      },
    },
  });

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: "",
      permissions: { ...DEFAULT_PERMISSIONS },
    },
  });

  const openCreateDialog = () => {
    setEditingId(null);
    form.reset({
      name: "",
      permissions: { ...DEFAULT_PERMISSIONS },
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (role: any) => {
    setEditingId(role.id);
    form.reset({
      name: role.name,
      // Merge existing permissions with defaults to ensure all modules exist
      permissions: permissionsToFormMatrix(role.permissions as Record<string, unknown>),
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: RoleFormValues) => {
    if (editingId) {
      updateRole.mutate({ id: editingId, data });
    } else {
      createRole.mutate({ data });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this role?")) {
      deleteRole.mutate({ id });
    }
  };

  const rolesList = coerceRoleList(rolesData) as any[];

  const columns = useMemo<ColumnDef<(typeof rolesList)[number]>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Role Name",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: "overview",
        header: "Permissions Overview",
        cell: ({ row }) => {
          const { modules, actions } = countGrantedPermissions(row.original.permissions);
          return (
            <span className="text-sm text-muted-foreground">
              {modules} modules · {actions} permissions enabled
            </span>
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { headerClassName: "w-[100px]", cellClassName: "text-right" },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            {can("roles", "edit") && (
              <Button variant="ghost" size="icon" onClick={() => openEditDialog(row.original)}>
                <Edit className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
            {can("roles", "delete") && (
              <Button variant="ghost" size="icon" onClick={() => handleDelete(row.original.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [can, openEditDialog, handleDelete],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Roles & Permissions</h2>
          <p className="text-muted-foreground">Define what users can see and do</p>
        </div>
        {can("roles", "add") && (
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Role
        </Button>
        )}
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <DataTable
          columns={columns}
          data={rolesList}
          isLoading={isLoading}
          emptyMessage="No roles found."
        />
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Role" : "Create Role"}</DialogTitle>
            <DialogDescription>Define the role's access levels across different system modules.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Sales Manager" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4">
                <h4 className="text-sm font-medium leading-none">Permissions Matrix</h4>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Module</TableHead>
                        <TableHead className="text-center">View</TableHead>
                        <TableHead className="text-center">Add</TableHead>
                        <TableHead className="text-center">Edit</TableHead>
                        <TableHead className="text-center">Delete</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {PERMISSION_MODULES.map(({ key, label }) => (
                        <TableRow key={key}>
                          <TableCell className="font-medium">{label}</TableCell>
                          {["view", "add", "edit", "delete"].map((action) => (
                            <TableCell key={action} className="text-center">
                              <FormField
                                control={form.control}
                                name={`permissions.${key}.${action}` as any}
                                render={({ field }) => (
                                  <FormItem className="flex items-center justify-center space-y-0">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                {((editingId && can("roles", "edit")) || (!editingId && can("roles", "add"))) && (
                <Button type="submit" disabled={createRole.isPending || updateRole.isPending}>
                  {editingId ? "Update Role" : "Create Role"}
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