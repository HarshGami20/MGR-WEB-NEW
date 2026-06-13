import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { GuideTarget } from "@/components/user-guide/guide-target";
import { GuideOrderFormPreview } from "@/components/user-guide/guide-order-form-preview";
import {
  LiveDialogShell,
  LiveField,
  LivePageHeader,
  LivePageRoot,
} from "@/components/user-guide/guide-live/shared";
import { DUMMY } from "@/lib/user-guide/mock-data";
import { getFormConfig } from "@/lib/user-guide/preview-configs";
import { ArrowLeft, Upload } from "lucide-react";

type FormPreviewProps = {
  screenId: string;
  moduleKey: string;
  activeHighlight: string | null;
};

function UsersDialogPreview({ screenId, activeHighlight }: FormPreviewProps) {
  const isEdit = screenId.includes("edit");
  return (
    <LivePageRoot>
      <LivePageHeader
        title="Users"
        subtitle="Manage staff accounts and permissions"
        activeHighlight={activeHighlight}
        targetId="page-header"
      />
      <LiveDialogShell
        title={isEdit ? "Edit user" : "Add user"}
        description="Staff account with role and branch access."
        activeHighlight={activeHighlight}
      >
        <LiveField label="Full Name" value={DUMMY.user} required />
        <LiveField label="Mobile Number" value="98765 43210" required />
        <LiveField label="Email (Optional)" value="priya@mgrcasa.example" />
        <div>
          <label className="text-sm font-medium">Role*</label>
          <div className="mt-1.5 h-9 rounded-md border bg-background px-3 flex items-center text-sm">{DUMMY.role}</div>
        </div>
        <div>
          <label className="text-sm font-medium">Branches*</label>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">{DUMMY.branchName}</Badge>
          </div>
        </div>
        {!isEdit ? (
          <LiveField label="Password" value="••••••••" required />
        ) : null}
      </LiveDialogShell>
    </LivePageRoot>
  );
}

function RolesDialogPreview({ screenId, activeHighlight }: FormPreviewProps) {
  const isEdit = screenId.includes("edit");
  return (
    <LivePageRoot>
      <LivePageHeader title="Roles & Permissions" subtitle="Control module access per role" activeHighlight={activeHighlight} />
      <LiveDialogShell title={isEdit ? "Edit role" : "Add role"} activeHighlight={activeHighlight}>
        <LiveField label="Role name" value="Sales Executive" required />
        <div className="rounded-lg border overflow-hidden">
          <div className="grid grid-cols-4 gap-2 bg-muted/40 px-3 py-2 text-xs font-medium">
            <span>Module</span>
            <span className="text-center">View</span>
            <span className="text-center">Add</span>
            <span className="text-center">Edit</span>
          </div>
          {[
            ["Orders", true, true, true],
            ["Products", true, false, false],
            ["Purchase orders", true, true, true],
          ].map(([mod, v, a, e]) => (
            <div key={String(mod)} className="grid grid-cols-4 gap-2 px-3 py-2 border-t text-sm items-center">
              <span>{mod}</span>
              <div className="flex justify-center"><Checkbox checked={Boolean(v)} disabled /></div>
              <div className="flex justify-center"><Checkbox checked={Boolean(a)} disabled /></div>
              <div className="flex justify-center"><Checkbox checked={Boolean(e)} disabled /></div>
            </div>
          ))}
        </div>
      </LiveDialogShell>
    </LivePageRoot>
  );
}

function CategoryDialogPreview({ screenId, activeHighlight }: FormPreviewProps) {
  const isEdit = screenId.includes("edit");
  return (
    <LivePageRoot>
      <LivePageHeader title="Categories" subtitle="Organize products into categories" activeHighlight={activeHighlight} />
      <LiveDialogShell
        title={isEdit ? "Edit category" : "Add category"}
        description={isEdit ? "Update category name or parent." : "Create a main or sub-category."}
        activeHighlight={activeHighlight}
      >
        <LiveField label="Category name" value={DUMMY.category.name} required />
        <div>
          <label className="text-sm font-medium">Parent category</label>
          <div className="mt-1.5 h-9 rounded-md border bg-background px-3 flex items-center text-sm text-muted-foreground">
            None (main category)
          </div>
        </div>
      </LiveDialogShell>
    </LivePageRoot>
  );
}

function SupplierDialogPreview({ screenId, activeHighlight }: FormPreviewProps) {
  const isEdit = screenId.includes("edit");
  return (
    <LivePageRoot>
      <LivePageHeader title="Suppliers" subtitle="Manage supplier contacts" activeHighlight={activeHighlight} />
      <LiveDialogShell title={isEdit ? "Edit supplier" : "Add supplier"} activeHighlight={activeHighlight}>
        <LiveField label="Company name" value={DUMMY.supplier.name} required />
        <LiveField label="Contact person" value={DUMMY.supplier.contact} />
        <LiveField label="Mobile" value={DUMMY.supplier.mobile} required />
        <LiveField label="Email" value="anil@comfortfabrics.example" />
      </LiveDialogShell>
    </LivePageRoot>
  );
}

function ProductFormPreview({ screenId, activeHighlight }: FormPreviewProps) {
  const isEdit = screenId.includes("edit");
  return (
    <LivePageRoot>
      <GuideTarget id="page-header" activeHighlight={activeHighlight} label="Product form">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="-ml-2" disabled>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{isEdit ? "Edit product" : "Add product"}</h2>
            <p className="text-muted-foreground">Catalog details, pricing, and images</p>
          </div>
        </div>
      </GuideTarget>

      <GuideTarget id="form-fields" activeHighlight={activeHighlight} label="Product fields">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
              <LiveField label="Product name" value={DUMMY.product.name} required />
              <LiveField label="SKU" value={DUMMY.product.sku} />
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea readOnly className="mt-1.5 bg-background resize-none" rows={3} value="Premium upholstered sofa set with solid wood frame." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <LiveField label="Base price (₹)" value="42000" required />
                <LiveField label="GST %" value="18" />
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
              <label className="text-sm font-medium">Images</label>
              <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center text-muted-foreground">
                <Upload className="h-8 w-8 mb-2 opacity-50" />
                <span className="text-xs">Drop images or click to upload</span>
              </div>
            </div>
            <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
              <label className="text-sm font-medium">Category</label>
              <div className="h-9 rounded-md border bg-background px-3 flex items-center text-sm">{DUMMY.product.category}</div>
              <div className="flex items-center gap-2 pt-1">
                <Switch id="guide-track-stock" checked disabled />
                <Label htmlFor="guide-track-stock" className="text-sm">Track inventory</Label>
              </div>
            </div>
          </div>
        </div>
      </GuideTarget>

      <GuideTarget id="form-save" activeHighlight={activeHighlight} label="Save product">
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" disabled>Cancel</Button>
          <Button disabled>{isEdit ? "Save changes" : "Create product"}</Button>
        </div>
      </GuideTarget>
    </LivePageRoot>
  );
}

function GenericFormPreview({ screenId, moduleKey, activeHighlight }: FormPreviewProps) {
  const cfg = getFormConfig(screenId, moduleKey);
  return (
    <LivePageRoot>
      <LivePageHeader title={cfg.title} subtitle={cfg.subtitle} activeHighlight={activeHighlight} />
      <GuideTarget id="form-fields" activeHighlight={activeHighlight} label={cfg.formTitle}>
        <div className="max-w-lg rounded-xl border bg-card p-5 shadow-sm space-y-4">
          <h3 className="font-semibold">{cfg.formTitle}</h3>
          {cfg.fields.map((f) => (
            <LiveField key={f.label} label={f.label} value={f.value} />
          ))}
        </div>
      </GuideTarget>
      <GuideTarget id="form-save" activeHighlight={activeHighlight} label="Save">
        <div className="flex gap-2 mt-4">
          <Button disabled>Save</Button>
          <Button variant="outline" disabled>Cancel</Button>
        </div>
      </GuideTarget>
    </LivePageRoot>
  );
}

export function GuideLiveFormPreview(props: FormPreviewProps) {
  const { screenId } = props;

  if (
    screenId === "orders-create" ||
    screenId === "orders-edit" ||
    screenId === "po-create" ||
    screenId === "po-edit"
  ) {
    return <GuideOrderFormPreview screenId={screenId} activeHighlight={props.activeHighlight} />;
  }
  if (screenId.startsWith("users-")) return <UsersDialogPreview {...props} />;
  if (screenId.startsWith("roles-")) return <RolesDialogPreview {...props} />;
  if (screenId.startsWith("categories-")) return <CategoryDialogPreview {...props} />;
  if (screenId.startsWith("suppliers-") || screenId.startsWith("manufacturers-")) {
    return <SupplierDialogPreview {...props} />;
  }
  if (screenId === "payments-record" || screenId === "inventory-adjust" || screenId === "complaints-create" || screenId === "complaints-update") {
    return <GenericFormPreview {...props} />;
  }
  if (screenId.startsWith("branches-")) return <SupplierDialogPreview {...props} />;
  return <GenericFormPreview {...props} />;
}
