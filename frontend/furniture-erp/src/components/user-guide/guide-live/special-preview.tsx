import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { GuideTarget } from "@/components/user-guide/guide-target";
import {
  LiveDashboardHeader,
  LiveField,
  LivePageHeader,
  LivePageRoot,
} from "@/components/user-guide/guide-live/shared";
import { DUMMY } from "@/lib/user-guide/mock-data";
import { AlertCircle, Box, Calculator, ClipboardList, Download, Wallet } from "lucide-react";

type SpecialPreviewProps = {
  screenId: string;
  activeHighlight: string | null;
};

export function GuideLiveDashboardPreview({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <LivePageRoot className="max-w-[1600px]">
      <GuideTarget id="branch-picker" activeHighlight={activeHighlight} label="Branch selector">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Branch</span>
          <span className="inline-flex h-9 items-center rounded-xl border border-primary/25 bg-primary/5 px-4 font-medium">
            {DUMMY.branchName}
          </span>
        </div>
      </GuideTarget>

      <LiveDashboardHeader activeHighlight={activeHighlight} />

      <GuideTarget id="kpi-cards" activeHighlight={activeHighlight} label="KPI summary">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Orders today", value: "12", sub: "3 delivered · 5 in progress" },
            { label: "Revenue today", value: "₹1.8L", sub: "₹42K received · ₹38K due" },
            { label: "Open orders", value: "18", sub: "6 received · 12 manufacturing" },
            { label: "Deliveries today", value: "4 / 8", sub: "2 out for delivery" },
          ].map(({ label, value, sub }) => (
            <div key={label} className="rounded-2xl border bg-card p-5 shadow-sm">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-3xl font-bold tracking-tight mt-1">{value}</p>
              <p className="text-xs text-muted-foreground mt-2">{sub}</p>
            </div>
          ))}
        </div>
      </GuideTarget>

      <GuideTarget id="charts" activeHighlight={activeHighlight} label="Revenue & analytics">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Earning report</h3>
              <div className="flex gap-1">
                {[7, 14, 30].map((d) => (
                  <Button key={d} size="sm" variant={d === 14 ? "secondary" : "ghost"} className="h-7 text-xs" disabled>
                    {d}d
                  </Button>
                ))}
              </div>
            </div>
            <div className="h-40 flex items-end gap-1.5">
              {[35, 55, 40, 70, 48, 62, 80, 45, 58, 72, 50, 65, 78, 52].map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-primary/30" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <h3 className="font-semibold mb-4">Recent orders</h3>
            <div className="space-y-3">
              {[DUMMY.order, { id: "SO-2026-0138", customer: "Anita Desai", total: "₹22,100" }].map((o) => (
                <div key={o.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <div>
                    <span className="font-mono font-medium">{o.id}</span>
                    <span className="block text-muted-foreground text-xs">{o.customer}</span>
                  </div>
                  <span className="font-medium tabular-nums">{o.total}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </GuideTarget>
    </LivePageRoot>
  );
}

export function GuideLiveSettingsPreview({ screenId, activeHighlight }: SpecialPreviewProps) {
  const canEdit = screenId === "settings-edit";
  return (
    <LivePageRoot>
      <LivePageHeader title="Settings" subtitle="Company profile, invoice defaults, and your account" activeHighlight={activeHighlight} />
      <GuideTarget id="settings-form" activeHighlight={activeHighlight} label="Company settings">
        <div className="grid gap-6 lg:grid-cols-2 max-w-5xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Box className="h-5 w-5 text-primary" />
                Company
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <LiveField label="Company name" value="MGR Casa Furniture" />
              <LiveField label="GST number" value="29ABCDE1234F1Z5" />
              <LiveField label="Address" value="42, MG Road, Bengaluru" />
              <LiveField label="Phone" value="+91 80 1234 5678" />
              <LiveField label="Email" value="hello@mgrcasa.example" />
              {canEdit ? (
                <GuideTarget id="form-save" activeHighlight={activeHighlight} label="Save settings" dimOthers={false}>
                  <Button disabled>Save company settings</Button>
                </GuideTarget>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Invoice defaults
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <LiveField label="Default GST %" value="18" />
              <LiveField label="Invoice prefix" value="INV-" />
            </CardContent>
          </Card>
        </div>
      </GuideTarget>
    </LivePageRoot>
  );
}

export function GuideLiveReportsPreview({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <LivePageRoot>
      <LivePageHeader title="Reports" subtitle="Revenue, sales, and category-wise analytics" activeHighlight={activeHighlight} />
      <GuideTarget id="report-filters" activeHighlight={activeHighlight} label="Filters">
        <div className="flex flex-wrap gap-3 bg-card p-4 rounded-lg border">
          <div className="h-9 w-36 rounded-md border bg-background px-3 flex items-center text-sm">Year: 2026</div>
          <div className="h-9 w-40 rounded-md border bg-background px-3 flex items-center text-sm">{DUMMY.branchName}</div>
          <div className="h-9 w-44 rounded-md border bg-background px-3 flex items-center text-sm">Category: All</div>
        </div>
      </GuideTarget>
      <GuideTarget id="report-types" activeHighlight={activeHighlight} label="Report tables">
        <div className="grid gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Monthly revenue</CardTitle>
              <Button variant="outline" size="sm" disabled>
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 text-sm">
                {["Jan", "Feb", "Mar", "Apr"].map((m, i) => (
                  <div key={m} className="rounded-lg border p-3">
                    <p className="text-muted-foreground">{m} 2026</p>
                    <p className="font-semibold tabular-nums mt-1">{["₹8.2L", "₹9.1L", "₹10.4L", "₹12.4L"][i]}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </GuideTarget>
    </LivePageRoot>
  );
}

export function GuideLiveCalculatorPreview({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <LivePageRoot className="max-w-2xl">
      <LivePageHeader title="Curtain calculator" subtitle="Estimate fabric and price from window dimensions" activeHighlight={activeHighlight} />
      <GuideTarget id="calc-inputs" activeHighlight={activeHighlight} label="Dimensions & rates">
        <div className="rounded-xl border bg-card p-5 shadow-sm grid grid-cols-2 gap-4">
          <LiveField label="Width (inches)" value="84" />
          <LiveField label="Height (inches)" value="96" />
          <LiveField label="Fullness multiplier" value="2" />
          <LiveField label="Fabric rate / meter (₹)" value="450" />
          <div className="col-span-2 flex items-center gap-2">
            <Switch id="guide-gst-calc" checked disabled />
            <Label htmlFor="guide-gst-calc" className="text-sm">Include GST</Label>
          </div>
        </div>
      </GuideTarget>
      <GuideTarget id="calc-result" activeHighlight={activeHighlight} label="Estimated price">
        <div className="rounded-xl bg-primary/10 border border-primary/20 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Estimated total</p>
            <p className="text-2xl font-bold text-primary tabular-nums">₹8,640</p>
          </div>
          <Calculator className="h-8 w-8 text-primary/60" />
        </div>
      </GuideTarget>
    </LivePageRoot>
  );
}

export function GuideLivePartnerPreview({ screenId, activeHighlight }: SpecialPreviewProps) {
  if (screenId === "partner-dashboard") {
    return (
      <LivePageRoot>
        <LivePageHeader
          title="Partner portal"
          subtitle="Your purchase orders and deliveries"
          activeHighlight={activeHighlight}
        />
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Open POs", value: "3", icon: ClipboardList },
            { label: "Awaiting delivery", value: "2", icon: Box },
            { label: "Open complaints", value: "1", icon: AlertCircle },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border bg-card p-5 shadow-sm">
              <Icon className="h-5 w-5 text-primary mb-2" />
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>
      </LivePageRoot>
    );
  }

  if (screenId === "partner-settings") {
    return <GuideLiveSettingsPreview screenId="settings-view" activeHighlight={activeHighlight} />;
  }

  if (screenId === "partner-product-detail") {
    return (
      <LivePageRoot>
        <LivePageHeader title={DUMMY.product.name} subtitle={DUMMY.product.sku} activeHighlight={activeHighlight} />
        <GuideTarget id="detail-content" activeHighlight={activeHighlight} label="Product info">
          <div className="grid gap-4 sm:grid-cols-2 max-w-3xl">
            <div className="rounded-xl border bg-muted/20 aspect-square flex items-center justify-center text-muted-foreground">
              Product image
            </div>
            <div className="space-y-3">
              <div><p className="text-xs text-muted-foreground">Category</p><p className="font-medium">{DUMMY.product.category}</p></div>
              <div><p className="text-xs text-muted-foreground">Price</p><p className="font-medium">{DUMMY.product.price}</p></div>
              <div><p className="text-xs text-muted-foreground">Description</p><p className="text-sm">Premium upholstered sofa set.</p></div>
            </div>
          </div>
        </GuideTarget>
      </LivePageRoot>
    );
  }

  return null;
}

export function GuideLiveComplaintsFormPreview({ screenId, activeHighlight }: SpecialPreviewProps) {
  const isUpdate = screenId === "complaints-update";
  return (
    <LivePageRoot>
      <LivePageHeader
        title={isUpdate ? "Update complaint" : "New complaint"}
        subtitle="Support ticket linked to orders or POs"
        activeHighlight={activeHighlight}
      />
      <GuideTarget id="form-fields" activeHighlight={activeHighlight} label="Complaint form">
        <div className="max-w-lg rounded-xl border bg-card p-5 shadow-sm space-y-4">
          <LiveField label="Subject" value={DUMMY.complaint.subject} required />
          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea readOnly rows={4} className="mt-1.5 bg-background resize-none" value="Delivery was delayed by 2 days. Customer waiting for sofa set." />
          </div>
          <LiveField label="Related order / PO" value={DUMMY.order.id} />
          <LiveField label="Priority" value="Medium" />
        </div>
      </GuideTarget>
      <GuideTarget id="form-save" activeHighlight={activeHighlight} label="Submit">
        <Button disabled className="mt-4">{isUpdate ? "Save update" : "Submit complaint"}</Button>
      </GuideTarget>
    </LivePageRoot>
  );
}

export function GuideLiveInventoryAdjustPreview({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <LivePageRoot>
      <LivePageHeader title="Adjust stock" subtitle="Manual inventory correction for a product" activeHighlight={activeHighlight} />
      <LiveDialogShellInline activeHighlight={activeHighlight}>
        <LiveField label="Product" value={DUMMY.product.name} />
        <LiveField label="Branch" value={DUMMY.branchName} />
        <LiveField label="Current stock" value={String(DUMMY.product.stock)} />
        <LiveField label="Adjustment (+ / −)" value="+2" required />
        <LiveField label="Reason" value="Physical count correction" />
      </LiveDialogShellInline>
    </LivePageRoot>
  );
}

function LiveDialogShellInline({ children, activeHighlight }: { children: React.ReactNode; activeHighlight: string | null }) {
  return (
    <GuideTarget id="form-fields" activeHighlight={activeHighlight} label="Adjust stock form">
      <div className="max-w-md rounded-xl border bg-card shadow-lg overflow-hidden">
        <div className="p-5 border-b font-semibold">Adjust inventory</div>
        <div className="p-5 space-y-4">{children}</div>
        <div className="flex justify-end gap-2 p-5 border-t">
          <Button variant="outline" size="sm" disabled>Cancel</Button>
          <GuideTarget id="form-save" activeHighlight={activeHighlight} label="Save adjustment" dimOthers={false}>
            <Button size="sm" disabled>Save</Button>
          </GuideTarget>
        </div>
      </div>
    </GuideTarget>
  );
}

export function GuideLivePaymentsRecordPreview({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <LivePageRoot>
      <LivePageHeader title="Record payment" subtitle="Add a payment against an order" activeHighlight={activeHighlight} />
      <GuideTarget id="form-fields" activeHighlight={activeHighlight} label="Payment form">
        <div className="max-w-md rounded-xl border bg-card p-5 shadow-sm space-y-4">
          <LiveField label="Order" value={DUMMY.order.id} />
          <LiveField label="Amount (₹)" value="25000" required />
          <LiveField label="Payment mode" value="UPI" />
          <LiveField label="Reference / UTR" value="UPI123456789" />
          <LiveField label="Date" value="2026-06-12" />
        </div>
      </GuideTarget>
      <GuideTarget id="form-save" activeHighlight={activeHighlight} label="Record payment">
        <Button disabled className="mt-4">Record payment</Button>
      </GuideTarget>
    </LivePageRoot>
  );
}
