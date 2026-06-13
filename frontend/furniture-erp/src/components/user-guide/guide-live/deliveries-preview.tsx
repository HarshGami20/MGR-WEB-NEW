import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GuideTarget } from "@/components/user-guide/guide-target";
import { LiveField, LivePageRoot } from "@/components/user-guide/guide-live/shared";
import { DUMMY } from "@/lib/user-guide/mock-data";
import { DELIVERY_SLOTS_ENABLED } from "@/lib/delivery-feature";
import {
  ArrowLeft,
  Calendar,
  Eye,
  GitBranch,
  Pencil,
  Plus,
  Search,
  Trash2,
  Truck,
} from "lucide-react";

type DeliveriesPreviewProps = {
  screenId: string;
  activeHighlight: string | null;
};

function BranchStrip({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <GuideTarget id="branch-picker" activeHighlight={activeHighlight} label="Branch selector">
      <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs mb-4">
        <GitBranch className="h-3.5 w-3.5 text-primary" />
        <span className="text-muted-foreground">Branch:</span>
        <span className="font-medium">{DUMMY.branchName}</span>
      </div>
    </GuideTarget>
  );
}

function DeliveriesManagementHeader({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <GuideTarget id="page-header" activeHighlight={activeHighlight} label="Delivery Management">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Delivery Management</h2>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Manage time windows, capacity, and optional pincode rules for this branch.
          </p>
        </div>
      </div>
    </GuideTarget>
  );
}

function DeliveriesTabs({
  activeTab,
  activeHighlight,
  children,
}: {
  activeTab: "booked" | "drivers" | "slots";
  activeHighlight: string | null;
  children: React.ReactNode;
}) {
  return (
    <Tabs value={activeTab} className="space-y-4">
      <GuideTarget id="delivery-tabs" activeHighlight={activeHighlight} label="Page tabs">
        <TabsList>
          <TabsTrigger value="booked" className={activeTab === "booked" ? "" : "pointer-events-none opacity-60"}>
            Booked deliveries
          </TabsTrigger>
          <TabsTrigger value="drivers" className={activeTab === "drivers" ? "" : "pointer-events-none opacity-60"}>
            Drivers
          </TabsTrigger>
          {DELIVERY_SLOTS_ENABLED ? (
            <TabsTrigger value="slots" className={activeTab === "slots" ? "" : "pointer-events-none opacity-60"}>
              Delivery slots
            </TabsTrigger>
          ) : null}
        </TabsList>
      </GuideTarget>
      {children}
    </Tabs>
  );
}

function MockDateRangeFilter({ activeHighlight, targetId = "delivery-date-filter" }: { activeHighlight: string | null; targetId?: string }) {
  return (
    <GuideTarget id={targetId} activeHighlight={activeHighlight} label="Delivery date filter">
      <div className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-xs text-muted-foreground">
        <Calendar className="h-3.5 w-3.5" />
        <span>Jun 1, 2026 – Jun 30, 2026</span>
      </div>
    </GuideTarget>
  );
}

function BookedOrderRow({
  activeHighlight,
  showControls = true,
}: {
  activeHighlight: string | null;
  showControls?: boolean;
}) {
  return (
    <li className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-b last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium">{DUMMY.order.id}</span>
          <span className="text-sm truncate">{DUMMY.order.customer}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{DUMMY.order.mobile}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Delivery charge: ₹500</p>
      </div>
      {showControls ? (
        <div className="flex items-center gap-2 shrink-0">
          <GuideTarget id="driver-assign" activeHighlight={activeHighlight} label="Assign driver" dimOthers={false}>
            <div className="h-8 min-w-[130px] rounded-md border bg-background px-2 flex items-center text-xs">
              {DUMMY.driver.name}
            </div>
          </GuideTarget>
          <GuideTarget id="delivery-status" activeHighlight={activeHighlight} label="Delivery status" dimOthers={false}>
            <Badge variant="outline" className="h-8 px-3 bg-amber-50 text-amber-800 border-amber-200">
              Pending
            </Badge>
          </GuideTarget>
          <GuideTarget id="order-view-link" activeHighlight={activeHighlight} label="View order" dimOthers={false}>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
              <Eye className="h-4 w-4" />
            </Button>
          </GuideTarget>
        </div>
      ) : null}
    </li>
  );
}

function BookedScheduleList({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <GuideTarget id="delivery-schedule-list" activeHighlight={activeHighlight} label="Booked deliveries by date">
      <div className="space-y-6">
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/80 pb-2">
            <h3 className="text-base font-semibold">Sat, 14 Jun 2026</h3>
            <span className="text-xs text-muted-foreground tabular-nums">2 orders</span>
          </div>
          <div className="rounded-xl border border-border/80 bg-muted/15 overflow-hidden">
            <ul>
              <BookedOrderRow activeHighlight={activeHighlight} />
              <li className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium">SO-2026-0138</span>
                    <span className="text-sm truncate">Anita Desai</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">98760 11122</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="h-8 min-w-[130px] rounded-md border bg-background px-2 flex items-center text-xs text-muted-foreground">
                    Assign driver
                  </div>
                  <Badge variant="outline" className="bg-sky-50 text-sky-800 border-sky-200">Out for delivery</Badge>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </GuideTarget>
  );
}

function BookedDeliveriesTab({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <TabsContent value="booked" className="mt-0">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <CardTitle>Delevery Schedule</CardTitle>
          <MockDateRangeFilter activeHighlight={activeHighlight} />
        </CardHeader>
        <CardContent>
          <BookedScheduleList activeHighlight={activeHighlight} />
        </CardContent>
      </Card>
    </TabsContent>
  );
}

function DriversTabOnDeliveriesPage({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <TabsContent value="drivers" className="mt-0">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <CardTitle>Drivers</CardTitle>
          <Button variant="outline" size="sm" className="rounded-xl" disabled>
            Manage drivers
          </Button>
        </CardHeader>
        <CardContent>
          <GuideTarget id="data-table" activeHighlight={activeHighlight} label="Drivers on this branch">
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Driver</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead className="text-right">Deliveries</TableHead>
                    <TableHead className="text-right">Payments</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">{DUMMY.driver.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">91234 56789</TableCell>
                    <TableCell className="text-right tabular-nums">{DUMMY.driver.trips}</TableCell>
                    <TableCell className="text-right tabular-nums">4</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" disabled>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </GuideTarget>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

function OrderDeliverySectionPreview({
  activeHighlight,
  mode,
}: {
  activeHighlight: string | null;
  mode: "schedule" | "cancel";
}) {
  return (
    <LivePageRoot className="max-w-4xl">
      <GuideTarget id="page-header" activeHighlight={activeHighlight} label="Order form">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="sm" disabled>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h2 className="text-xl font-bold">{mode === "cancel" ? "Edit order" : "Create order"}</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Delivery date and driver are set in the Delivery section below.</p>
      </GuideTarget>

      <GuideTarget id="delivery-section" activeHighlight={activeHighlight} label="Delivery section">
        <div className="rounded-2xl border bg-card p-4 space-y-3 shadow-sm">
          <h3 className="font-semibold">Delivery</h3>
          <div className="grid md:grid-cols-2 gap-3 text-xs">
            <GuideTarget id="delivery-date-field" activeHighlight={activeHighlight} label="Delivery date" dimOthers={false}>
              <div>
                <label className="font-medium">Delivery date</label>
                <Input readOnly type="date" className="mt-1 h-8" value={mode === "cancel" ? "" : "2026-06-14"} placeholder={mode === "cancel" ? "Clear to unschedule" : undefined} />
                {mode === "cancel" ? (
                  <p className="text-[10px] text-muted-foreground mt-1">Remove the date to take the order off the delivery schedule.</p>
                ) : null}
              </div>
            </GuideTarget>
            <GuideTarget id="delivery-driver-field" activeHighlight={activeHighlight} label="Driver" dimOthers={false}>
              <div>
                <label className="font-medium">Driver</label>
                <div className="mt-1 h-8 rounded-md border px-2 flex items-center text-sm">{DUMMY.driver.name}</div>
              </div>
            </GuideTarget>
            <div>
              <label className="font-medium">Delivery charge (₹)</label>
              <Input readOnly className="mt-1 h-8" value="500" />
            </div>
            <div>
              <label className="font-medium">Delivery assignees</label>
              <div className="mt-1 h-8 rounded-md border px-2 flex items-center text-muted-foreground text-xs">Select staff…</div>
            </div>
          </div>
          {mode === "cancel" ? (
            <GuideTarget id="clear-delivery" activeHighlight={activeHighlight} label="Clear delivery booking">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                Clear delivery date and driver to cancel this booking. Save the order to apply.
              </div>
            </GuideTarget>
          ) : null}
        </div>
      </GuideTarget>

      <GuideTarget id="form-save" activeHighlight={activeHighlight} label="Save order">
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" disabled>
            Cancel
          </Button>
          <Button disabled>{mode === "cancel" ? "Save changes" : "Create order"}</Button>
        </div>
      </GuideTarget>
    </LivePageRoot>
  );
}

function DriversListPagePreview({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <LivePageRoot>
      <BranchStrip activeHighlight={activeHighlight} />
      <GuideTarget id="page-header" activeHighlight={activeHighlight} label="Drivers page">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Drivers</h1>
          <GuideTarget id="header-action-add" activeHighlight={activeHighlight} label="Add driver" dimOthers={false}>
            <Button className="rounded-xl" disabled>
              <Plus className="h-4 w-4 mr-2" />
              Add driver
            </Button>
          </GuideTarget>
        </div>
      </GuideTarget>

      <GuideTarget id="search" activeHighlight={activeHighlight} label="Search drivers">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input readOnly className="pl-8" placeholder="Search drivers…" value="" />
        </div>
      </GuideTarget>

      <GuideTarget id="data-table" activeHighlight={activeHighlight} label="Drivers table">
        <div className="bg-card rounded-lg border shadow-sm overflow-hidden mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Deliveries</TableHead>
                <TableHead>Payments</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  <p className="font-medium">{DUMMY.driver.name}</p>
                  <p className="text-xs text-muted-foreground">91234 56789</p>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{DUMMY.driver.vehicle}</TableCell>
                <TableCell className="tabular-nums">{DUMMY.driver.trips}</TableCell>
                <TableCell className="tabular-nums">4</TableCell>
                <TableCell className="text-right">
                  <GuideTarget id="table-actions" activeHighlight={activeHighlight} label="View driver" dimOthers={false}>
                    <Button variant="ghost" size="icon" disabled>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </GuideTarget>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div className="border-t px-4 py-3 text-xs text-muted-foreground">Showing 1–1 of 1 drivers</div>
        </div>
      </GuideTarget>
    </LivePageRoot>
  );
}

function DriverDetailPagePreview({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <div className="rounded-2xl border bg-muted/40 p-4 md:p-6 pointer-events-none select-none">
      <GuideTarget id="detail-header" activeHighlight={activeHighlight} label="Driver profile">
        <div className="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm">
          <Button variant="ghost" size="icon" className="rounded-full" disabled>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-xl font-semibold md:text-2xl">{DUMMY.driver.name}</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              91234 56789 · {DUMMY.driver.vehicle}
            </p>
          </div>
        </div>
      </GuideTarget>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 mt-6">
        <div className="lg:col-span-8 space-y-6">
          <GuideTarget id="driver-deliveries-table" activeHighlight={activeHighlight} label="Assigned deliveries">
            <section className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
              <h2 className="text-base font-semibold">Deliveries</h2>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Delivery date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Charge (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-mono text-sm text-primary">{DUMMY.order.id}</TableCell>
                      <TableCell>{DUMMY.order.customer}</TableCell>
                      <TableCell className="text-muted-foreground">14 Jun 2026</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">Pending</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">500</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </section>
          </GuideTarget>

          <GuideTarget id="payment-history" activeHighlight={activeHighlight} label="Payment history">
            <section className="rounded-2xl border bg-card p-5 shadow-sm">
              <h2 className="text-base font-semibold mb-3">Payment history</h2>
              <p className="text-sm text-muted-foreground">Past driver payments appear here with date, mode, and linked order.</p>
            </section>
          </GuideTarget>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <GuideTarget id="payment-summary" activeHighlight={activeHighlight} label="Payment summary">
            <section className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
              <h2 className="text-base font-semibold">Payment summary</h2>
              <div className="rounded-xl border bg-muted/15 p-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total payment</span>
                  <span className="text-xl font-bold tabular-nums">₹6,000</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="font-medium text-green-700 tabular-nums">₹2,000</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Due amount</span>
                  <span className="font-semibold tabular-nums">₹4,000</span>
                </div>
              </div>
            </section>
          </GuideTarget>

          <GuideTarget id="record-payment" activeHighlight={activeHighlight} label="Record driver payment">
            <section className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
              <h2 className="text-base font-semibold">Record payment</h2>
              <LiveField label="Amount (₹)" value="1500" />
              <LiveField label="Mode" value="UPI" />
              <Button className="w-full rounded-xl" disabled>
                Record payment
              </Button>
            </section>
          </GuideTarget>
        </div>
      </div>
    </div>
  );
}

function SlotsTabPreview({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <TabsContent value="slots" className="mt-0">
      <Card>
        <CardHeader>
          <CardTitle>Delivery Management</CardTitle>
          <p className="text-sm text-muted-foreground">Manage time windows, capacity, and pincode rules.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <GuideTarget id="slot-filters" activeHighlight={activeHighlight} label="Slot filters">
            <div className="rounded-lg border bg-muted/20 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <LiveField label="Label contains" value="Morning" />
              <MockDateRangeFilter activeHighlight={activeHighlight} targetId="slot-date-filter" />
              <LiveField label="Pincode" value="" />
              <LiveField label="Capacity" value="All" />
            </div>
          </GuideTarget>
          <GuideTarget id="slots-table" activeHighlight={activeHighlight} label="Delivery slots table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead className="text-right">Capacity</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>2026-06-14</TableCell>
                  <TableCell className="text-muted-foreground">09:00–12:00</TableCell>
                  <TableCell>Morning run</TableCell>
                  <TableCell className="text-right tabular-nums">2/10</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" disabled>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <GuideTarget id="delete-action" activeHighlight={activeHighlight} label="Delete slot" dimOthers={false} className="inline-flex">
                      <Button variant="ghost" size="icon" disabled>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </GuideTarget>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </GuideTarget>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export function GuideLiveDeliveriesPreview({ screenId, activeHighlight }: DeliveriesPreviewProps) {
  if (screenId === "drivers-list") {
    return <DriversListPagePreview activeHighlight={activeHighlight} />;
  }
  if (screenId === "drivers-detail") {
    return <DriverDetailPagePreview activeHighlight={activeHighlight} />;
  }
  if (screenId === "deliveries-schedule") {
    return <OrderDeliverySectionPreview activeHighlight={activeHighlight} mode="schedule" />;
  }
  if (screenId === "deliveries-cancel") {
    return <OrderDeliverySectionPreview activeHighlight={activeHighlight} mode="cancel" />;
  }

  if (screenId === "deliveries-update") {
    return (
      <LivePageRoot>
        <BranchStrip activeHighlight={activeHighlight} />
        <DeliveriesManagementHeader activeHighlight={activeHighlight} />
        <DeliveriesTabs activeTab="booked" activeHighlight={activeHighlight}>
          <BookedDeliveriesTab activeHighlight={activeHighlight} />
        </DeliveriesTabs>
      </LivePageRoot>
    );
  }

  if (screenId === "deliveries-slots") {
    return (
      <LivePageRoot>
        <BranchStrip activeHighlight={activeHighlight} />
        <DeliveriesManagementHeader activeHighlight={activeHighlight} />
        <DeliveriesTabs activeTab="slots" activeHighlight={activeHighlight}>
          <SlotsTabPreview activeHighlight={activeHighlight} />
        </DeliveriesTabs>
      </LivePageRoot>
    );
  }

  // deliveries-calendar — main booked deliveries view (default tab)
  return (
    <LivePageRoot>
      <BranchStrip activeHighlight={activeHighlight} />
      <DeliveriesManagementHeader activeHighlight={activeHighlight} />
      <DeliveriesTabs activeTab="booked" activeHighlight={activeHighlight}>
        <BookedDeliveriesTab activeHighlight={activeHighlight} />
      </DeliveriesTabs>
    </LivePageRoot>
  );
}
