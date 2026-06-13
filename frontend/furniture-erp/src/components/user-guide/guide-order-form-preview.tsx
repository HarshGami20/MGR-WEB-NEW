import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GuideTarget } from "@/components/user-guide/guide-target";
import { DUMMY } from "@/lib/user-guide/mock-data";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ChevronsUpDown,
  ImageIcon,
  Layers,
  Package,
  PackagePlus,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";

type FormPreviewMode = "order-create" | "order-edit" | "po-create" | "po-edit";

type GuideOrderFormPreviewProps = {
  mode: FormPreviewMode;
  activeHighlight: string | null;
};

function LineItemBlock({
  activeHighlight,
  onlyForLabel,
  showStockHint,
}: {
  activeHighlight: string | null;
  onlyForLabel: "order" | "PO";
  showStockHint?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 p-3 space-y-3">
      <GuideTarget id="line-item-mode" activeHighlight={activeHighlight} label="Catalog vs custom item">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" className="rounded-xl h-8 pointer-events-none">
            <Package className="h-3.5 w-3.5 mr-1.5" />
            From catalog
          </Button>
          <Button type="button" size="sm" variant="outline" className="rounded-xl h-8 pointer-events-none">
            <PackagePlus className="h-3.5 w-3.5 mr-1.5" />
            Custom (this {onlyForLabel} only)
          </Button>
        </div>
      </GuideTarget>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <GuideTarget id="product-select" activeHighlight={activeHighlight} label="Search & pick product" dimOthers={false}>
          <div>
            <label className="text-xs font-medium">Product</label>
            <Button
              type="button"
              variant="outline"
              className="mt-1 w-full justify-between font-normal h-9 text-xs pointer-events-none"
            >
              <span className="truncate">{DUMMY.product.name}</span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
            <p className="text-[10px] text-muted-foreground mt-1">Search by name or SKU in the dropdown</p>
          </div>
        </GuideTarget>

        <GuideTarget id="variant-select" activeHighlight={activeHighlight} label="Pick variant (if any)" dimOthers={false}>
          <div>
            <label className="text-xs font-medium flex items-center gap-1">
              <Layers className="h-3 w-3" /> Variant
            </label>
            <Button
              type="button"
              variant="outline"
              className="mt-1 w-full justify-between font-normal h-9 text-xs pointer-events-none"
            >
              <span className="truncate">Charcoal · 3+2</span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
            <p className="text-[10px] text-muted-foreground mt-1">Required when product has variants</p>
          </div>
        </GuideTarget>
      </div>

      <div>
        <label className="text-xs font-medium">Description</label>
        <Textarea
          readOnly
          rows={2}
          className="mt-1 text-xs resize-none pointer-events-none"
          placeholder="Notes, specs, or details for this line (optional)"
          value="Includes installation at customer site"
        />
      </div>

      <GuideTarget id="line-qty-price" activeHighlight={activeHighlight} label="Quantity & unit price">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium">Quantity</label>
            <Input readOnly className="mt-1 h-9 text-xs pointer-events-none" value="1" />
            {showStockHint ? (
              <p className="text-[10px] text-muted-foreground mt-1">Max 8 available (branch stock)</p>
            ) : null}
          </div>
          <div>
            <label className="text-xs font-medium">Unit price (₹)</label>
            <Input readOnly className="mt-1 h-9 text-xs pointer-events-none" value="48500" />
          </div>
        </div>
      </GuideTarget>
    </div>
  );
}

function BranchPickerStrip({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <GuideTarget id="branch-picker" activeHighlight={activeHighlight} label="Branch (app header)">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2 text-xs">
        <span className="text-muted-foreground">Branch:</span>
        <span className="inline-flex h-8 items-center rounded-lg border border-primary/25 bg-primary/5 px-3 font-medium">
          {DUMMY.branchName}
        </span>
        <span className="text-muted-foreground hidden sm:inline">— stock & assignees use this branch</span>
      </div>
    </GuideTarget>
  );
}

function SalesOrderFormPreview({ mode, activeHighlight }: GuideOrderFormPreviewProps) {
  const isEdit = mode === "order-edit";

  return (
    <div className="rounded-xl border bg-muted/20 overflow-hidden pointer-events-none select-none text-sm">
      {!isEdit ? <BranchPickerStrip activeHighlight={activeHighlight} /> : null}
      <GuideTarget id="form-header" activeHighlight={activeHighlight} label="Order form header">
        <div className="flex flex-col gap-3 border-b bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border">
              <ArrowLeft className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{isEdit ? "Edit order" : "Create order"}</h2>
                {!isEdit ? (
                  <Badge variant="outline" className="text-[10px]">
                    New
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-xl pointer-events-none">
              Cancel
            </Button>
            <GuideTarget id="form-save" activeHighlight={activeHighlight} label="Save order" dimOthers={false} className="inline-flex">
              <Button size="sm" className="rounded-xl pointer-events-none">
                {isEdit ? "Save changes" : "Create order"}
              </Button>
            </GuideTarget>
          </div>
        </div>
      </GuideTarget>

      <div className="grid lg:grid-cols-12 gap-4 p-4">
        <div className="lg:col-span-8 space-y-4">
          <GuideTarget id="order-details" activeHighlight={activeHighlight} label="Customer details">
            <div className="rounded-2xl border bg-card p-4 space-y-3 shadow-sm">
              <h3 className="font-semibold">Order details</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Customer Name*</label>
                  <Input readOnly className="mt-1 h-9 text-xs" value={DUMMY.order.customer} />
                </div>
                <div>
                  <label className="text-xs font-medium">Mobile*</label>
                  <Input readOnly className="mt-1 h-9 text-xs" value={DUMMY.order.mobile} />
                </div>
              </div>
              <GuideTarget id="gst-section" activeHighlight={activeHighlight} label="GST invoice settings" dimOthers={false}>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium">GST Invoice</label>
                    <div className="mt-1 h-9 rounded-md border bg-background px-3 flex items-center text-xs">Yes</div>
                  </div>
                  <div>
                    <label className="text-xs font-medium">GST Number*</label>
                    <Input readOnly className="mt-1 h-9 text-xs" value="29ABCDE1234F1Z5" />
                  </div>
                </div>
              </GuideTarget>
              <div>
                <label className="text-xs font-medium">Address</label>
                <Input readOnly className="mt-1 h-9 text-xs" value="42, MG Road, Bengaluru" />
              </div>
              <div>
                <label className="text-xs font-medium">Assign to (team)</label>
                <div className="mt-1 h-9 rounded-md border bg-background px-3 flex items-center text-xs text-muted-foreground">
                  Select staff…
                </div>
              </div>
              {isEdit ? (
                <div>
                  <label className="text-xs font-medium">Order status</label>
                  <div className="mt-1 h-9 rounded-md border bg-background px-3 flex items-center text-xs">{DUMMY.order.status}</div>
                </div>
              ) : null}
            </div>
          </GuideTarget>

          <GuideTarget id="order-items-section" activeHighlight={activeHighlight} label="Order line items">
            <div className="rounded-2xl border bg-card p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Order items</h3>
                <GuideTarget id="add-item" activeHighlight={activeHighlight} label="Add another line" dimOthers={false}>
                  <Button variant="outline" size="sm" className="rounded-xl h-8 pointer-events-none">
                    <Plus className="h-4 w-4 mr-0.5" /> Add item
                  </Button>
                </GuideTarget>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <LineItemBlock activeHighlight={activeHighlight} onlyForLabel="order" showStockHint />
                </div>
                <Button variant="ghost" size="icon" className="shrink-0 pointer-events-none">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </GuideTarget>

          <GuideTarget id="delivery-section" activeHighlight={activeHighlight} label="Delivery settings">
            <div className="rounded-2xl border bg-card p-4 space-y-2 shadow-sm">
              <h3 className="font-semibold">Delivery</h3>
              <div className="grid md:grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="font-medium">Delivery charge (₹)</label>
                  <Input readOnly className="mt-1 h-8" value="500" />
                </div>
                <div>
                  <label className="font-medium">Driver</label>
                  <div className="mt-1 h-8 rounded-md border px-2 flex items-center">{DUMMY.driver.name}</div>
                </div>
              </div>
            </div>
          </GuideTarget>
        </div>

        <aside className="lg:col-span-4 space-y-3">
          <GuideTarget id="payment-sidebar" activeHighlight={activeHighlight} label="Payment & totals">
            <div className="rounded-2xl border bg-card p-4 space-y-3 shadow-sm">
              <h3 className="font-semibold">Payment summary</h3>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sub Total</span>
                  <span>₹41,102</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST</span>
                  <span>₹7,398</span>
                </div>
                <div className="flex justify-between font-bold text-base pt-1 border-t">
                  <span>Total (incl. GST)</span>
                  <span>{DUMMY.order.total}</span>
                </div>
              </div>
              <h4 className="font-medium pt-2">Payment</h4>
              <div className="grid gap-2 text-xs">
                <div>
                  <label className="font-medium">Payment status</label>
                  <div className="mt-1 h-8 rounded-md border px-2 flex items-center">Partially Paid</div>
                </div>
                <div>
                  <label className="font-medium">Mode of payment</label>
                  <div className="mt-1 h-8 rounded-md border px-2 flex items-center">UPI</div>
                </div>
                <div>
                  <label className="font-medium">Advance amount (₹)</label>
                  <Input readOnly className="mt-1 h-8" value="25000" />
                </div>
              </div>
            </div>
          </GuideTarget>

          <GuideTarget id="challan-section" activeHighlight={activeHighlight} label="Challan photo (required)">
            <div className="rounded-2xl border bg-card p-4 space-y-2 shadow-sm">
              <h3 className="font-semibold">Challan & photos</h3>
              <p className="text-[10px] text-muted-foreground">Signed challan is required before saving.</p>
              <div className="rounded-xl border-2 border-dashed bg-muted/25 flex flex-col items-center justify-center py-8 gap-2">
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
                <span className="text-xs font-medium">Add challan</span>
                <span className="text-[10px] text-muted-foreground">Camera or gallery</span>
              </div>
              <Button variant="secondary" size="sm" className="rounded-xl w-full pointer-events-none">
                <Upload className="h-3.5 w-3.5 mr-1" /> Upload challan
              </Button>
            </div>
          </GuideTarget>
        </aside>
      </div>
    </div>
  );
}

function PurchaseOrderFormPreview({ mode, activeHighlight }: GuideOrderFormPreviewProps) {
  const isEdit = mode === "po-edit";
  const isDialog = mode === "po-create";

  return (
    <div
      className={cn(
        "rounded-xl border bg-muted/20 overflow-hidden pointer-events-none select-none text-sm",
        isDialog && "max-w-[700px] mx-auto shadow-lg",
      )}
    >
      {isDialog ? <BranchPickerStrip activeHighlight={activeHighlight} /> : null}
      <GuideTarget id="form-header" activeHighlight={activeHighlight} label={isDialog ? "Create PO dialog" : "Edit PO page"}>
        <div className={cn("border-b bg-card p-4", isDialog && "pb-3")}>
          <h2 className="text-lg font-semibold">{isEdit ? `Edit ${DUMMY.po.id}` : "Create Purchase Order"}</h2>
          {isEdit ? (
            <p className="text-xs text-muted-foreground mt-0.5">Update vendor, line items, and delivery details</p>
          ) : null}
        </div>
      </GuideTarget>

      <div className="p-4 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <GuideTarget id="po-type" activeHighlight={activeHighlight} label="PO type">
            <div>
              <label className="text-xs font-medium">PO Type</label>
              <div className="mt-1 h-9 rounded-md border bg-card px-3 flex items-center text-xs">
                Supplier (Ready Goods)
              </div>
            </div>
          </GuideTarget>
          <GuideTarget id="po-vendor" activeHighlight={activeHighlight} label="Supplier or manufacturer">
            <div>
              <label className="text-xs font-medium">Supplier</label>
              <div className="mt-1 h-9 rounded-md border bg-card px-3 flex items-center text-xs">{DUMMY.po.supplier}</div>
            </div>
          </GuideTarget>
        </div>

        <GuideTarget id="order-items-section" activeHighlight={activeHighlight} label="PO line items">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Items</h4>
              <GuideTarget id="add-item" activeHighlight={activeHighlight} label="Add line item" dimOthers={false}>
                <Button variant="outline" size="sm" className="pointer-events-none">
                  <Plus className="h-4 w-4 mr-2" /> Add item
                </Button>
              </GuideTarget>
            </div>
            <div className="flex gap-2 border rounded-md p-3">
              <div className="flex-1">
                <LineItemBlock activeHighlight={activeHighlight} onlyForLabel="PO" />
              </div>
              <Button variant="ghost" size="icon" className="pointer-events-none">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        </GuideTarget>

        <GuideTarget id="expected-delivery" activeHighlight={activeHighlight} label="Expected delivery date">
          <div className="max-w-xs">
            <label className="text-xs font-medium">Expected Delivery Date</label>
            <Input readOnly type="date" className="mt-1 h-9 text-xs" value="2026-06-20" />
          </div>
        </GuideTarget>

        {isEdit ? (
          <div>
            <label className="text-xs font-medium">Notes</label>
            <Textarea readOnly rows={2} className="mt-1 text-xs resize-none" placeholder="Optional notes for the vendor" />
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" className="pointer-events-none">
            Cancel
          </Button>
          <GuideTarget id="form-save" activeHighlight={activeHighlight} label="Submit PO" dimOthers={false}>
            <Button size="sm" className="pointer-events-none">{isEdit ? "Save changes" : "Create PO"}</Button>
          </GuideTarget>
        </div>
      </div>
    </div>
  );
}

export function GuideOrderFormPreview({ screenId, activeHighlight }: { screenId: string; activeHighlight: string | null }) {
  const mode: FormPreviewMode =
    screenId === "orders-edit"
      ? "order-edit"
      : screenId === "po-edit"
        ? "po-edit"
        : screenId === "po-create"
          ? "po-create"
          : "order-create";

  if (mode.startsWith("order")) {
    return <SalesOrderFormPreview mode={mode} activeHighlight={activeHighlight} />;
  }
  return <PurchaseOrderFormPreview mode={mode} activeHighlight={activeHighlight} />;
}
