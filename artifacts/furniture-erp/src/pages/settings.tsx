import { useEffect } from "react";
import { 
  useGetSettings, 
  useUpdateSettings,
  getGetSettingsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Building, FileText, Settings2 } from "lucide-react";

const settingsSchema = z.object({
  companyName: z.string().min(1, "Company Name is required"),
  gstNumber: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email("Invalid email").optional().nullable().or(z.literal("")),
  defaultGstPercent: z.coerce.number().min(0).max(100),
  invoicePrefix: z.string().min(1, "Prefix is required"),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function Settings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: settingsData, isLoading } = useGetSettings();

  const updateSettings = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        toast({ title: "Settings updated successfully" });
      },
    },
  });

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      companyName: "",
      gstNumber: "",
      address: "",
      phone: "",
      email: "",
      defaultGstPercent: 18,
      invoicePrefix: "INV-",
    },
  });

  useEffect(() => {
    if (settingsData) {
      form.reset({
        companyName: settingsData.companyName,
        gstNumber: settingsData.gstNumber || "",
        address: settingsData.address || "",
        phone: settingsData.phone || "",
        email: settingsData.email || "",
        defaultGstPercent: settingsData.defaultGstPercent,
        invoicePrefix: settingsData.invoicePrefix,
      });
    }
  }, [settingsData, form]);

  const onSubmit = (data: SettingsFormValues) => {
    updateSettings.mutate({ data });
  };

  if (isLoading) {
    return <div className="p-8">Loading settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl pb-10">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings2 className="h-6 w-6 text-primary" />
          System Settings
        </h2>
        <p className="text-muted-foreground">Manage your company profile and application preferences</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building className="h-5 w-5 text-muted-foreground" />
                Company Profile
              </CardTitle>
              <CardDescription>
                This information appears on your invoices and reports.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="companyName"
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
                <FormField
                  control={form.control}
                  name="gstNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GSTIN</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Phone</FormLabel>
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
                    <FormLabel>Registered Address</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-muted-foreground" />
                Billing & Invoice Preferences
              </CardTitle>
              <CardDescription>
                Configure how your invoices and taxes are generated.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="invoicePrefix"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice Prefix</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. INV-2024-" />
                      </FormControl>
                      <p className="text-xs text-muted-foreground mt-1">
                        Resulting invoice: {field.value}0001
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultGstPercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default GST Rate (%)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={updateSettings.isPending}>
              {updateSettings.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}