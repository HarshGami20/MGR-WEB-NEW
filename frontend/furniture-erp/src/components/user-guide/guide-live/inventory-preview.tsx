import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GuideTarget } from "@/components/user-guide/guide-target";
import { LivePageRoot } from "@/components/user-guide/guide-live/shared";
import { DUMMY } from "@/lib/user-guide/mock-data";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpToLine,
  Calendar,
  Download,
  Plus,
  RefreshCw,
} from "lucide-react";

type InventoryPreviewProps = {
  screenId: string;
  activeHighlight: string | null;
};

function TypeBadge({ type }: { type: "in" | "out" | "adjustment" }) {
  if (type === "in") {
    return (
      <div className="flex items-center gap-2">
        <ArrowDownToLine className="h-4 w-4 text-green-500" />
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          Stock In
        </Badge>
      </div>
    );
  }
  if (type === "out") {
    return (
      <div className="flex items-center gap-2">
        <ArrowUpToLine className="h-4 w-4 text-red-500" />
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
          Stock Out
        </Badge>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <RefreshCw className="h-4 w-4 text-blue-500" />
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
        Adjustment
      </Badge>
    </div>
  );
}

function SourceBadge({ source }: { source: "manual" | "order" | "product" | "variant" | "other" }) {
  const styles: Record<typeof source, string> = {
    manual: "bg-slate-50 text-slate-700 border-slate-200",
    order: "bg-purple-50 text-purple-700 border-purple-200",
    product: "bg-blue-50 text-blue-700 border-blue-200",
    variant: "bg-indigo-50 text-indigo-700 border-indigo-200",
    other: "",
  };
  const labels: Record<typeof source, string> = {
    manual: "Manual",
    order: "Order",
    product: "Product",
    variant: "Variant",
    other: "Other",
  };
  return (
    <Badge variant="outline" className={styles[source]}>
      {labels[source]}
    </Badge>
  );
}

function InventoryPageHeader({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <GuideTarget id="page-header" activeHighlight={activeHighlight} label="Inventory page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground">Manage stock levels and track movements</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GuideTarget
            id="header-action-export"
            activeHighlight={activeHighlight}
            label="Export to Excel"
            dimOthers={false}
          >
            <Button type="button" variant="outline" disabled>
              <Download className="mr-2 h-4 w-4" />
              Export to Excel
            </Button>
          </GuideTarget>
          <GuideTarget
            id="header-action-adjust"
            activeHighlight={activeHighlight}
            label="Adjust Stock"
            dimOthers={false}
          >
            <Button disabled>
              <Plus className="mr-2 h-4 w-4" />
              Adjust Stock
            </Button>
          </GuideTarget>
        </div>
      </div>
    </GuideTarget>
  );
}

function InventoryFilters({
  activeHighlight,
  lowStockActive = false,
}: {
  activeHighlight: string | null;
  lowStockActive?: boolean;
}) {
  return (
    <GuideTarget id="filters" activeHighlight={activeHighlight} label="Filters panel">
      <div className="flex flex-col gap-4 bg-card p-4 rounded-lg border">
        <div className="flex flex-1 flex-wrap gap-4 items-center">
          <GuideTarget id="filter-date-range" activeHighlight={activeHighlight} label="Date range" dimOthers={false}>
            <div className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>Jun 1, 2026 – Jun 30, 2026</span>
            </div>
          </GuideTarget>
          <GuideTarget id="filter-category" activeHighlight={activeHighlight} label="Category filter" dimOthers={false}>
            <div className="h-9 min-w-[160px] rounded-md border bg-background px-3 flex items-center text-xs text-muted-foreground">
              Category · All
            </div>
          </GuideTarget>
          <GuideTarget
            id="filter-movement-type"
            activeHighlight={activeHighlight}
            label="Movement type"
            dimOthers={false}
          >
            <div className="h-9 w-[180px] rounded-md border bg-background px-3 flex items-center text-xs">
              All Movements
            </div>
          </GuideTarget>
          <GuideTarget id="filter-source" activeHighlight={activeHighlight} label="Source filter" dimOthers={false}>
            <div className="h-9 w-[180px] rounded-md border bg-background px-3 flex items-center text-xs">
              All Sources
            </div>
          </GuideTarget>
          <GuideTarget id="filter-low-stock" activeHighlight={activeHighlight} label="Low Stock toggle" dimOthers={false}>
            <Button
              type="button"
              variant={lowStockActive ? "default" : "outline"}
              className="h-9 shrink-0 border-red-300 text-red-700"
              disabled
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Low Stock
              <Badge variant="destructive" className="ml-2 h-5 min-w-5 px-1.5 tabular-nums">
                {DUMMY.lowStockProducts.length}
              </Badge>
            </Button>
          </GuideTarget>
        </div>
      </div>
    </GuideTarget>
  );
}

function MovementLogsTable({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <GuideTarget id="data-table" activeHighlight={activeHighlight} label="Movement history">
      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Updated by</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DUMMY.inventoryLogs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{log.date}</TableCell>
                <TableCell>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{log.product}</div>
                    {log.variant ? (
                      <div className="text-xs text-muted-foreground truncate">Variant: {log.variant}</div>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <TypeBadge type={log.type} />
                </TableCell>
                <TableCell>
                  <SourceBadge source={log.source} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{log.user}</TableCell>
                <TableCell className="text-right font-medium">
                  {log.type === "out" ? "-" : "+"}
                  {log.quantity}
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground text-sm max-w-[200px] truncate block">{log.notes}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="border-t px-4 py-3 text-sm text-muted-foreground flex items-center justify-between">
          <span>Showing 1–3 of 48 logs</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled>
              Next
            </Button>
          </div>
        </div>
      </div>
    </GuideTarget>
  );
}

function LowStockPanel({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <GuideTarget id="low-stock-panel" activeHighlight={activeHighlight} label="Low Stock Alerts">
      <div className="rounded-lg border border-red-200 bg-red-50/30 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-red-200/80 bg-red-50/60 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
          <h3 className="text-base font-semibold text-red-800">
            Low Stock Alerts ({DUMMY.lowStockProducts.length})
          </h3>
        </div>
        <GuideTarget id="low-stock-table" activeHighlight={activeHighlight} label="Low stock table" dimOthers={false}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Current stock</TableHead>
                <TableHead className="text-right">Threshold</TableHead>
                <TableHead className="text-right w-[140px]">
                  <div className="flex justify-end">
                    <Button type="button" size="sm" variant="outline" disabled>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Adjust Stock
                    </Button>
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DUMMY.lowStockProducts.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{row.sku}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="destructive" className="tabular-nums">
                      {row.stockQty}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{row.lowStockThreshold}</TableCell>
                  <TableCell className="text-right">
                    <GuideTarget
                      id="restock-action"
                      activeHighlight={activeHighlight}
                      label="Restock"
                      dimOthers={false}
                      className="inline-flex"
                    >
                      <Button type="button" size="sm" variant="secondary" disabled>
                        Restock
                      </Button>
                    </GuideTarget>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </GuideTarget>
      </div>
    </GuideTarget>
  );
}

function AdjustInventoryDialog({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <GuideTarget id="adjust-dialog" activeHighlight={activeHighlight} label="Adjust Inventory dialog">
      <div className="rounded-lg border bg-card shadow-lg p-6 max-w-[425px] mx-auto mt-6 space-y-4">
        <p className="font-semibold">Adjust Inventory</p>

        <GuideTarget
          id="product-variant-select"
          activeHighlight={activeHighlight}
          label="Product & variant"
          dimOthers={false}
        >
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Product</Label>
              <div className="h-9 rounded-md border bg-background px-3 flex items-center text-sm">
                {DUMMY.product.name}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Variant</Label>
              <div className="h-9 rounded-md border bg-background px-3 flex items-center text-sm text-muted-foreground">
                Charcoal · 3+2
              </div>
            </div>
          </div>
        </GuideTarget>

        <div className="grid grid-cols-2 gap-4">
          <GuideTarget id="movement-type" activeHighlight={activeHighlight} label="Movement type" dimOthers={false}>
            <div className="space-y-2">
              <Label>Movement Type</Label>
              <div className="h-9 rounded-md border bg-background px-3 flex items-center text-sm">Stock In (+)</div>
            </div>
          </GuideTarget>
          <GuideTarget id="adjust-quantity" activeHighlight={activeHighlight} label="Quantity" dimOthers={false}>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input readOnly type="number" defaultValue="5" className="bg-background" />
            </div>
          </GuideTarget>
        </div>

        <GuideTarget id="adjust-notes" activeHighlight={activeHighlight} label="Notes / Reason" dimOthers={false}>
          <div className="space-y-2">
            <Label>Notes / Reason</Label>
            <Input readOnly placeholder="E.g., Damaged goods, Restock" defaultValue="Restock from warehouse" className="bg-background" />
          </div>
        </GuideTarget>

        <div className="flex justify-end gap-2 pt-4">
          <GuideTarget id="form-cancel" activeHighlight={activeHighlight} label="Cancel" dimOthers={false}>
            <Button type="button" variant="outline" disabled>
              Cancel
            </Button>
          </GuideTarget>
          <GuideTarget id="form-save" activeHighlight={activeHighlight} label="Save Adjustment" dimOthers={false}>
            <Button type="button" disabled>
              Save Adjustment
            </Button>
          </GuideTarget>
        </div>
      </div>
    </GuideTarget>
  );
}

function ExportInventoryDialog({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <GuideTarget id="export-dialog" activeHighlight={activeHighlight} label="Export Inventory dialog">
      <div className="rounded-lg border bg-card shadow-lg p-6 max-w-[500px] mx-auto mt-6 space-y-4">
        <div>
          <p className="font-semibold">Export Inventory to Excel</p>
          <p className="text-sm text-muted-foreground mt-1">
            Downloads stock movements and a current stock snapshot as Excel sheets (.xlsx).
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <GuideTarget id="export-branch" activeHighlight={activeHighlight} label="Branch" dimOthers={false}>
            <div className="space-y-2">
              <Label>Branch</Label>
              <div className="h-9 rounded-md border bg-background px-3 flex items-center text-sm">
                {DUMMY.branchName}
              </div>
            </div>
          </GuideTarget>
          <GuideTarget id="export-movement-type" activeHighlight={activeHighlight} label="Movement type" dimOthers={false}>
            <div className="space-y-2">
              <Label>Movement type</Label>
              <div className="h-9 rounded-md border bg-background px-3 flex items-center text-sm">All types</div>
            </div>
          </GuideTarget>
        </div>

        <GuideTarget id="export-category" activeHighlight={activeHighlight} label="Category" dimOthers={false}>
          <div className="space-y-2">
            <Label>Category</Label>
            <div className="h-9 rounded-md border bg-background px-3 flex items-center text-xs text-muted-foreground">
              Category · All
            </div>
          </div>
        </GuideTarget>

        <GuideTarget id="export-options" activeHighlight={activeHighlight} label="Export options" dimOthers={false}>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Switch id="guide-include-stock" checked disabled />
              <Label htmlFor="guide-include-stock">Include current stock sheet</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="guide-export-low-stock" checked={false} disabled />
              <Label htmlFor="guide-export-low-stock">Stock sheet: low stock only</Label>
            </div>
          </div>
        </GuideTarget>

        <GuideTarget id="export-date-filter" activeHighlight={activeHighlight} label="Date filter" dimOthers={false}>
          <div className="space-y-2">
            <Label>Date filter</Label>
            <div className="h-9 rounded-md border bg-background px-3 flex items-center text-xs text-muted-foreground">
              All dates
            </div>
            <p className="text-xs text-muted-foreground">
              Movement date filter applies to the log sheet only. Leave as &quot;All dates&quot; for full history.
            </p>
          </div>
        </GuideTarget>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" disabled>
            Cancel
          </Button>
          <GuideTarget id="export-save" activeHighlight={activeHighlight} label="Export" dimOthers={false}>
            <Button type="button" disabled>
              Export
            </Button>
          </GuideTarget>
        </div>
      </div>
    </GuideTarget>
  );
}

function InventoryListBase({
  activeHighlight,
  showLowStock = false,
}: {
  activeHighlight: string | null;
  showLowStock?: boolean;
}) {
  return (
    <>
      <InventoryPageHeader activeHighlight={activeHighlight} />
      <InventoryFilters activeHighlight={activeHighlight} lowStockActive={showLowStock} />
      {showLowStock ? (
        <LowStockPanel activeHighlight={activeHighlight} />
      ) : (
        <MovementLogsTable activeHighlight={activeHighlight} />
      )}
    </>
  );
}

export function GuideLiveInventoryPreview({ screenId, activeHighlight }: InventoryPreviewProps) {
  if (screenId === "inventory-list") {
    return (
      <LivePageRoot>
        <InventoryListBase activeHighlight={activeHighlight} />
      </LivePageRoot>
    );
  }

  if (screenId === "inventory-low-stock") {
    return (
      <LivePageRoot>
        <InventoryListBase activeHighlight={activeHighlight} showLowStock />
      </LivePageRoot>
    );
  }

  if (screenId === "inventory-adjust") {
    return (
      <LivePageRoot>
        <InventoryListBase activeHighlight={activeHighlight} />
        <AdjustInventoryDialog activeHighlight={activeHighlight} />
      </LivePageRoot>
    );
  }

  if (screenId === "inventory-export") {
    return (
      <LivePageRoot>
        <InventoryListBase activeHighlight={activeHighlight} />
        <ExportInventoryDialog activeHighlight={activeHighlight} />
      </LivePageRoot>
    );
  }

  return (
    <LivePageRoot>
      <InventoryListBase activeHighlight={activeHighlight} />
    </LivePageRoot>
  );
}
