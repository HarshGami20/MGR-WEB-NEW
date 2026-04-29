import { useState } from "react";
import { 
  useListRoles, 
  useCreateRole, 
  useUpdateRole, 
  useDeleteRole, 
  getListRolesQueryKey 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2 } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";

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

const MODULES = [
  "products",
  "orders",
  "inventory",
  "suppliers",
  "manufacturers",
  "reports",
  "invoices",
  "users"
];

const DEFAULT_PERMISSIONS = MODULES.reduce((acc, module) => {
  acc[module] = { view: false, add: false, edit: false, delete: false };
  return acc;
}, {} as Record<string, any>);

export default function Roles() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

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
      permissions: { ...DEFAULT_PERMISSIONS, ...(role.permissions || {}) },
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Roles & Permissions</h2>
          <p className="text-muted-foreground">Define what users can see and do</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Role
        </Button>
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role Name</TableHead>
              <TableHead>Permissions Overview</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center">Loading...</TableCell>
              </TableRow>
            ) : (rolesData as any[])?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">No roles found.</TableCell>
              </TableRow>
            ) : (
              (rolesData as any[])?.map((role: any) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">{role.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    Custom configuration across {Object.keys(role.permissions || {}).length} modules
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(role)}>
                        <Edit className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(role.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
                      {MODULES.map((module) => (
                        <TableRow key={module}>
                          <TableCell className="font-medium capitalize">{module}</TableCell>
                          {["view", "add", "edit", "delete"].map((action) => (
                            <TableCell key={action} className="text-center">
                              <FormField
                                control={form.control}
                                name={`permissions.${module}.${action}` as any}
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
                <Button type="submit" disabled={createRole.isPending || updateRole.isPending}>
                  {editingId ? "Update Role" : "Create Role"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}