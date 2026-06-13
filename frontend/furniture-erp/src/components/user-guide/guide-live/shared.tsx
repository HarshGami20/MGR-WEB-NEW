import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GuideTarget } from "@/components/user-guide/guide-target";
import { cn } from "@/lib/utils";
import { Edit, Eye, Search, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

/** Matches live ERP list page outer wrapper */
export function LivePageRoot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-6 pointer-events-none select-none text-sm", className)} aria-hidden>
      {children}
    </div>
  );
}

export function LivePageHeader({
  title,
  subtitle,
  actions,
  targetId = "page-header",
  activeHighlight,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  targetId?: string;
  activeHighlight: string | null;
}) {
  return (
    <GuideTarget id={targetId} activeHighlight={activeHighlight} label={title}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          {subtitle ? <p className="text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </GuideTarget>
  );
}

export function LiveDashboardHeader({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <GuideTarget id="page-header" activeHighlight={activeHighlight} label="Dashboard">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">Today&apos;s orders, revenue & fulfilment at a glance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <Button size="lg" className="rounded-xl px-5 shadow-md" disabled>
            New order
          </Button>
          <Button variant="outline" size="lg" className="rounded-xl px-5 border-primary/25" disabled>
            Product
          </Button>
        </div>
      </div>
    </GuideTarget>
  );
}

export function LiveSearchFilter({
  placeholder,
  activeHighlight,
  extra,
  layout = "orders",
}: {
  placeholder: string;
  activeHighlight: string | null;
  extra?: ReactNode;
  layout?: "orders" | "inline" | "simple";
}) {
  if (layout === "simple") {
    return (
      <GuideTarget id="filters" activeHighlight={activeHighlight} label="Search & filters">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg border">
          <GuideTarget id="search" activeHighlight={activeHighlight} label="Search" dimOthers={false} className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder={placeholder} className="pl-8 bg-background" readOnly />
          </GuideTarget>
        </div>
      </GuideTarget>
    );
  }

  if (layout === "inline") {
    return (
      <GuideTarget id="filters" activeHighlight={activeHighlight} label="Filters">
        <div className="flex flex-col gap-4 bg-card p-4 rounded-lg border">
          <div className="flex flex-1 flex-wrap gap-4 items-center">
            <GuideTarget id="search" activeHighlight={activeHighlight} label="Search" dimOthers={false} className="relative w-full max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder={placeholder} className="pl-8 bg-background" readOnly />
            </GuideTarget>
            {extra}
          </div>
        </div>
      </GuideTarget>
    );
  }

  return (
    <GuideTarget id="filters" activeHighlight={activeHighlight} label="Filters panel">
      <div className="flex flex-col gap-4 bg-card p-4 rounded-lg border">
        <div className="flex flex-1 flex-wrap gap-4 items-end">
          <GuideTarget id="search" activeHighlight={activeHighlight} label="Search" dimOthers={false} className="space-y-1 w-full max-w-sm">
            <label className="text-xs text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder={placeholder} className="pl-8 bg-background" readOnly />
            </div>
          </GuideTarget>
          {extra}
        </div>
      </div>
    </GuideTarget>
  );
}

export function LiveFilterSelect({ label, value = "All" }: { label: string; value?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="h-9 w-[180px] rounded-md border bg-background px-3 flex items-center text-xs text-muted-foreground">{value}</div>
    </div>
  );
}

export function LiveLowStockToggle() {
  return (
    <div className="flex items-center gap-2">
      <Switch id="guide-low-stock" checked={false} disabled />
      <Label htmlFor="guide-low-stock" className="text-sm font-medium whitespace-nowrap">
        Low stock only
      </Label>
    </div>
  );
}

export type LiveColumn = { header: ReactNode; className?: string; headClassName?: string };

export function LiveDataTable({
  columns,
  rows,
  activeHighlight,
  showActions = true,
  footer,
}: {
  columns: LiveColumn[];
  rows: ReactNode[][];
  activeHighlight: string | null;
  showActions?: boolean;
  footer?: ReactNode;
}) {
  return (
    <GuideTarget id="data-table" activeHighlight={activeHighlight} label="Results table">
      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col, i) => (
                <TableHead key={i} className={col.headClassName}>
                  {col.header}
                </TableHead>
              ))}
              {showActions ? <TableHead className="w-[100px] text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((cells, ri) => (
              <TableRow key={ri}>
                {cells.map((cell, ci) => (
                  <TableCell key={ci} className={columns[ci]?.className}>
                    {cell}
                  </TableCell>
                ))}
                {showActions ? (
                  <TableCell className="text-right">
                    <GuideTarget
                      id={ri === 0 ? "table-actions" : "table-actions-other"}
                      activeHighlight={activeHighlight}
                      label="Row actions"
                      dimOthers={false}
                      className="inline-flex"
                    >
                      <div className="inline-flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-9 w-9" disabled>
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9" disabled>
                          <Edit className="h-4 w-4 text-primary" />
                        </Button>
                        <GuideTarget id="delete-action" activeHighlight={activeHighlight} label="Delete" dimOthers={false} className="inline-flex">
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" disabled>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </GuideTarget>
                      </div>
                    </GuideTarget>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {footer ?? (
          <div className="border-t border-border/60 px-6 py-4 text-sm text-muted-foreground hidden xl:block">
            Showing 1–10 of 24
          </div>
        )}
      </div>
    </GuideTarget>
  );
}

export function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Confirmed: "bg-blue-50 text-blue-700 border-blue-200",
    "Order Received": "bg-yellow-50 text-yellow-700 border-yellow-200",
    Pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
    Complete: "bg-green-50 text-green-700 border-green-200",
    pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
    confirmed: "bg-blue-50 text-blue-700 border-blue-200",
    delivered: "bg-green-50 text-green-700 border-green-200",
  };
  return (
    <Badge variant="outline" className={map[status] ?? ""}>
      {status}
    </Badge>
  );
}

export function LiveDialogShell({
  title,
  description,
  children,
  activeHighlight,
  targetId = "form-fields",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  activeHighlight: string | null;
  targetId?: string;
}) {
  return (
    <div className="rounded-xl border bg-card shadow-lg max-w-lg mx-auto overflow-hidden">
      <div className="p-6 pb-4 border-b">
        <h3 className="font-semibold text-lg">{title}</h3>
        {description ? <p className="text-sm text-muted-foreground mt-1">{description}</p> : null}
      </div>
      <GuideTarget id={targetId} activeHighlight={activeHighlight} label={title} className="p-6 space-y-4">
        {children}
      </GuideTarget>
      <div className="flex justify-end gap-2 p-6 pt-0 border-t mt-2 pt-4">
        <Button variant="outline" size="sm" disabled>
          Cancel
        </Button>
        <GuideTarget id="form-save" activeHighlight={activeHighlight} label="Save" dimOthers={false}>
          <Button size="sm" disabled>
            Save
          </Button>
        </GuideTarget>
      </div>
    </div>
  );
}

export function LiveField({ label, value, required }: { label: string; value?: string; required?: boolean }) {
  return (
    <div>
      <label className="text-sm font-medium">
        {label}
        {required ? "*" : ""}
      </label>
      <Input readOnly className="mt-1.5 bg-background" value={value ?? ""} placeholder={`Enter ${label.toLowerCase()}`} />
    </div>
  );
}

export function LiveDeleteDialog({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <GuideTarget id="delete-dialog" activeHighlight={activeHighlight} label="Confirm delete">
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 max-w-sm ml-auto mt-4">
        <p className="text-sm font-semibold text-destructive">Delete confirmation</p>
        <p className="text-xs text-muted-foreground mt-1">Type DELETE to confirm permanently.</p>
        <Input className="mt-2 h-8 text-xs bg-background" readOnly value="DELETE" />
      </div>
    </GuideTarget>
  );
}
