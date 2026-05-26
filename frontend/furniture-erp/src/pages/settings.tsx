import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { 
  useGetSettings, 
  useUpdateSettings,
  getGetSettingsQueryKey
} from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@/api-client/custom-fetch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Building, Eye, EyeOff, FileText, LockKeyhole, Settings2, UserCircle2, Upload, ChevronDown } from "lucide-react";
import { usePermissions } from "@/lib/permissions";
import { useAuth } from "@/lib/auth";
import { FIELD_LIMITS, profileFormSchema, settingsFormSchema, type ProfileFormValues, type SettingsFormValues } from "@/lib/form-validation";
import { ValidatedInput } from "@/components/validated-input";

const settingsSchema = settingsFormSchema;
const profileSchema = profileFormSchema;
const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(FIELD_LIMITS.passwordMin, `Password must be at least ${FIELD_LIMITS.passwordMin} characters`)
      .max(FIELD_LIMITS.passwordMax, `Password must be at most ${FIELD_LIMITS.passwordMax} characters`),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  });

type PasswordChangeFormValues = z.infer<typeof passwordChangeSchema>;

export default function Settings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const canEdit = can("settings", "edit");

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
  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      mobile: "",
      email: "",
      avatarUrl: "",
    },
  });
  const passwordForm = useForm<PasswordChangeFormValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });
  const avatarUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [showPasswordFields, setShowPasswordFields] = useState({
    current: false,
    next: false,
    confirm: false,
  });
  const avatarChoices = useMemo(() => {
    const base = profileForm.watch("name") || user?.name || "user";
    return Array.from({ length: 24 }, (_, i) => avatarUrlForName(`${base}-${i + 1}`));
  }, [profileForm.watch("name"), user?.name]);

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
  useEffect(() => {
    if (!user) return;
    profileForm.reset({
      name: user.name || "",
      mobile: user.mobile || "",
      email: user.email || "",
      avatarUrl: (user as any).avatarUrl || "",
    });
  }, [user, profileForm]);

  const onSubmit = (data: SettingsFormValues) => {
    updateSettings.mutate({ data });
  };
  const onSubmitProfile = async (data: ProfileFormValues) => {
    try {
      await customFetch("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: data.name,
          mobile: data.mobile,
          email: data.email || null,
          avatarUrl: data.avatarUrl || null,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast({ title: "Profile updated successfully" });
    } catch (error: any) {
      toast({
        title: "Failed to update profile",
        description: error?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };
  const onSubmitPassword = async (data: PasswordChangeFormValues) => {
    try {
      await customFetch("/api/auth/me/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        }),
      });
      passwordForm.reset();
      setShowPasswordFields({ current: false, next: false, confirm: false });
      toast({ title: "Password changed successfully" });
    } catch (error: any) {
      toast({
        title: "Failed to change password",
        description: error?.message ?? "Please check your current password and try again.",
        variant: "destructive",
      });
    }
  };
  const togglePasswordVisibility = (field: keyof typeof showPasswordFields) => {
    setShowPasswordFields((prev) => ({ ...prev, [field]: !prev[field] }));
  };
  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please upload an image file", variant: "destructive" });
      return;
    }
    if (file.size > 1024 * 1024 * 2) {
      toast({ title: "Image too large (max 2MB)", variant: "destructive" });
      return;
    }
    const formData = new FormData();
    formData.append("avatar", file);
    try {
      setIsAvatarUploading(true);
      const response = await customFetch<{ avatarUrl: string }>("/api/auth/me/avatar", {
        method: "POST",
        body: formData,
      });
      profileForm.setValue("avatarUrl", response.avatarUrl, { shouldValidate: true, shouldDirty: true });
      toast({ title: "Avatar uploaded" });
    } catch (error: any) {
      toast({
        title: "Failed to upload avatar",
        description: error?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAvatarUploading(false);
    }
    event.currentTarget.value = "";
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
        {!canEdit && (
          <p className="text-sm text-muted-foreground mt-2 rounded-md border bg-muted/40 px-3 py-2">
            You have read-only access. Editing requires Settings → Edit permission.
          </p>
        )}
      </div>

      <Form {...form}>
        <form onSubmit={canEdit ? form.handleSubmit(onSubmit) : (e) => e.preventDefault()} className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserCircle2 className="h-5 w-5 text-muted-foreground" />
                My Profile
              </CardTitle>
              <CardDescription>
                Update your own details and optional avatar image.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...profileForm}>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-14 w-14 border border-border/60">
                      <AvatarImage
                        src={profileForm.watch("avatarUrl") || avatarUrlForName(profileForm.watch("name") || user?.name || "")}
                        alt={profileForm.watch("name") || user?.name || "User"}
                      />
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {initials(profileForm.watch("name") || user?.name || "")}
                      </AvatarFallback>
                    </Avatar>
                    <input
                      ref={avatarUploadInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline" className=" rounded-xl">
                          {isAvatarUploading ? "Uploading..." : "Select Avatar"}
                          <ChevronDown className="h-4 w-4 ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[320px] p-3">
                        <p className="text-xs text-muted-foreground mb-2">First option uploads your own image</p>
                        <div className="grid grid-cols-6 gap-2">
                          <button
                            type="button"
                            className="size-11.5 p-0.5 rounded-full border border-dashed border-primary/40 hover:border-primary transition-colors"
                            onClick={() => avatarUploadInputRef.current?.click()}
                          >
                            <div className="h-10 w-10 rounded-full bg-primary/8 text-primary flex items-center justify-center">
                              <Upload className="h-4 w-4" />
                            </div>
                          </button>
                          {avatarChoices.map((url) => {
                            const active = (profileForm.watch("avatarUrl") || "") === url;
                            return (
                              <button
                                key={url}
                                type="button"
                                className={`rounded-full p-0.5 border ${active ? "border-primary" : "border-transparent"} transition-colors`}
                                onClick={() => profileForm.setValue("avatarUrl", url, { shouldDirty: true })}
                              >
                                <Avatar className="h-10 w-10">
                                  <AvatarImage src={url} alt="Avatar option" />
                                  <AvatarFallback>?</AvatarFallback>
                                </Avatar>
                              </button>
                            );
                          })}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={profileForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl><ValidatedInput field={field} rule="personName" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={profileForm.control}
                      name="mobile"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mobile</FormLabel>
                          <FormControl><ValidatedInput field={field} rule="mobile" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={profileForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl><Input type="email" {...field} value={field.value || ""} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" onClick={profileForm.handleSubmit(onSubmitProfile)}>Save Profile</Button>
                  </div>
                </div>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <LockKeyhole className="h-5 w-5 text-muted-foreground" />
                Change Password
              </CardTitle>
              <CardDescription>
                Update your login password after confirming your current password.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...passwordForm}>
                <div
                  className="space-y-4"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void passwordForm.handleSubmit(onSubmitPassword)();
                    }
                  }}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={passwordForm.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                {...field}
                                type={showPasswordFields.current ? "text" : "password"}
                                autoComplete="current-password"
                                maxLength={FIELD_LIMITS.passwordMax}
                                className="pl-10 pr-10"
                              />
                              <button
                                type="button"
                                tabIndex={-1}
                                className="absolute inset-y-0 right-0 z-10 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => togglePasswordVisibility("current")}
                                aria-label={showPasswordFields.current ? "Hide current password" : "Show current password"}
                              >
                                {showPasswordFields.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={passwordForm.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                {...field}
                                type={showPasswordFields.next ? "text" : "password"}
                                autoComplete="new-password"
                                maxLength={FIELD_LIMITS.passwordMax}
                                className="pl-10 pr-10"
                              />
                              <button
                                type="button"
                                tabIndex={-1}
                                className="absolute inset-y-0 right-0 z-10 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => togglePasswordVisibility("next")}
                                aria-label={showPasswordFields.next ? "Hide new password" : "Show new password"}
                              >
                                {showPasswordFields.next ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <p className="text-xs text-muted-foreground mt-1">
                            Use {FIELD_LIMITS.passwordMin}-{FIELD_LIMITS.passwordMax} characters.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={passwordForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm New Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                {...field}
                                type={showPasswordFields.confirm ? "text" : "password"}
                                autoComplete="new-password"
                                maxLength={FIELD_LIMITS.passwordMax}
                                className="pl-10 pr-10"
                              />
                              <button
                                type="button"
                                tabIndex={-1}
                                className="absolute inset-y-0 right-0 z-10 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => togglePasswordVisibility("confirm")}
                                aria-label={showPasswordFields.confirm ? "Hide confirmed password" : "Show confirmed password"}
                              >
                                {showPasswordFields.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={passwordForm.handleSubmit(onSubmitPassword)}
                      disabled={passwordForm.formState.isSubmitting}
                    >
                      {passwordForm.formState.isSubmitting ? "Changing..." : "Change Password"}
                    </Button>
                  </div>
                </div>
              </Form>
            </CardContent>
          </Card>
          
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
                        <ValidatedInput field={field} rule="companyName" disabled={!canEdit} />
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
                        <ValidatedInput field={field} rule="gstNumber" disabled={!canEdit} />
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
                        <Input type="email" {...field} value={field.value || ""} disabled={!canEdit} />
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
                        <ValidatedInput field={field} rule="mobile" disabled={!canEdit} />
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
                      <ValidatedInput field={field} rule="address" disabled={!canEdit} />
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
                        <ValidatedInput field={field} rule="invoicePrefix" placeholder="e.g. INV-2024-" disabled={!canEdit} />
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
                        <Input type="number" {...field} disabled={!canEdit} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={updateSettings.isPending}>
              {updateSettings.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
          )}
        </form>
      </Form>
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