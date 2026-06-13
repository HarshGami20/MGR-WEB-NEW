import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { GuideTarget } from "@/components/user-guide/guide-target";
import { LivePageRoot } from "@/components/user-guide/guide-live/shared";
import { DUMMY } from "@/lib/user-guide/mock-data";
import { Bell, Calendar, CalendarClock, ChevronsUpDown, CreditCard, GitBranch, Plus, Wallet } from "lucide-react";

type PaymentsPreviewProps = {
  screenId: string;
  activeHighlight: string | null;
};

function formatInr(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function ModeBadge({ mode }: { mode: "cash" | "bank_transfer" | "upi" | "cheque" }) {
  const styles: Record<typeof mode, string> = {
    cash: "bg-primary/5 text-primary border-primary/20",
    bank_transfer: "bg-blue-50 text-blue-700 border-blue-200",
    upi: "bg-purple-50 text-purple-700 border-purple-200",
    cheque: "bg-orange-50 text-orange-800 border-orange-200",
  };
  const labels: Record<typeof mode, string> = {
    cash: "Cash",
    bank_transfer: "Bank Transfer",
    upi: "UPI",
    cheque: "Cheque",
  };
  return (
    <Badge variant="outline" className={styles[mode]}>
      {labels[mode]}
    </Badge>
  );
}

function PaymentsPageHeader({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <GuideTarget id="page-header" activeHighlight={activeHighlight} label="Payments page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Payments</h2>
          <p className="text-muted-foreground">Track due balances and payment history</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <GuideTarget id="branch-selector" activeHighlight={activeHighlight} label="Branch filter" dimOthers={false}>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Branch</label>
              <div className="h-9 w-[200px] rounded-md border bg-background px-3 flex items-center text-sm">
                {DUMMY.branchName}
              </div>
            </div>
          </GuideTarget>
          <GuideTarget
            id="header-action-record"
            activeHighlight={activeHighlight}
            label="Record Payment"
            dimOthers={false}
          >
            <Button disabled>
              <Plus className="mr-2 h-4 w-4" />
              Record Payment
            </Button>
          </GuideTarget>
        </div>
      </div>
    </GuideTarget>
  );
}

function PaymentsTabsShell({
  activeTab,
  activeHighlight,
  children,
}: {
  activeTab: "payments" | "due" | "followups";
  activeHighlight: string | null;
  children: React.ReactNode;
}) {
  return (
    <Tabs value={activeTab} className="space-y-4">
      <GuideTarget id="payment-tabs" activeHighlight={activeHighlight} label="Page tabs">
        <TabsList>
          <TabsTrigger value="payments" className={activeTab === "payments" ? "" : "pointer-events-none opacity-60"}>
            All Payments
          </TabsTrigger>
          <TabsTrigger value="due" className={activeTab === "due" ? "" : "pointer-events-none opacity-60"}>
            Due
          </TabsTrigger>
          <TabsTrigger value="followups" className={activeTab === "followups" ? "" : "pointer-events-none opacity-60"}>
            Follow Ups
          </TabsTrigger>
        </TabsList>
      </GuideTarget>
      {children}
    </Tabs>
  );
}

function AllPaymentsFilters({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <GuideTarget id="filters" activeHighlight={activeHighlight} label="Filters">
      <div className="flex flex-wrap items-center justify-end gap-3">
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
        <GuideTarget id="filter-order" activeHighlight={activeHighlight} label="Order filter" dimOthers={false}>
          <div className="h-9 w-[280px] rounded-md border bg-background px-3 flex items-center text-xs">
            All Orders
          </div>
        </GuideTarget>
      </div>
    </GuideTarget>
  );
}

function PaymentsTable({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <GuideTarget id="data-table" activeHighlight={activeHighlight} label="Payments table">
      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Order #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Payment Mode</TableHead>
              <TableHead className="text-right">Amount (₹)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DUMMY.paymentsList.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-muted-foreground text-sm">{row.date}</TableCell>
                <TableCell className="font-mono text-sm">{row.orderNumber}</TableCell>
                <TableCell className="font-medium">{row.customer}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="flex w-fit max-w-[160px] items-center gap-1 font-normal">
                    <GitBranch className="h-3 w-3 shrink-0" />
                    <span className="truncate">{row.branch}</span>
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    <ModeBadge mode={row.mode} />
                    {row.mode === "cheque" && row.chequeNumber ? (
                      <p className="text-xs text-muted-foreground font-mono">#{row.chequeNumber}</p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right font-bold text-green-600">+{formatInr(row.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="border-t px-4 py-3 text-sm text-muted-foreground flex items-center justify-between">
          <span>Showing 1–3 of 24 payments</span>
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

function DueOrdersPanel({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <>
      <GuideTarget id="due-filters" activeHighlight={activeHighlight} label="Due filters">
        <div className="flex flex-wrap items-center justify-end gap-3 rounded-lg border bg-card p-4">
          <div className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>Jun 1, 2026 – Jun 30, 2026</span>
          </div>
          <div className="h-9 min-w-[160px] rounded-md border bg-background px-3 flex items-center text-xs text-muted-foreground">
            Category · All
          </div>
        </div>
      </GuideTarget>
      <GuideTarget id="due-table" activeHighlight={activeHighlight} label="Due orders table">
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-medium">Orders With Due Amount</p>
            <Badge variant="outline">{DUMMY.dueOrders.length} due</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-2 text-left">Order #</th>
                  <th className="px-4 py-2 text-left">Customer</th>
                  <th className="px-4 py-2 text-left">Order date</th>
                  <th className="px-4 py-2 text-left">Branch</th>
                  <th className="px-4 py-2 text-right">Total (₹)</th>
                  <th className="px-4 py-2 text-right">Paid (₹)</th>
                  <th className="px-4 py-2 text-right">Remaining (₹)</th>
                </tr>
              </thead>
              <tbody>
                {DUMMY.dueOrders.map((order) => (
                  <tr key={order.id} className="border-t">
                    <td className="px-4 py-2 font-mono">{order.orderNumber}</td>
                    <td className="px-4 py-2 font-medium">{order.customer}</td>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{order.orderDate}</td>
                    <td className="px-4 py-2 text-muted-foreground text-sm">{order.branch}</td>
                    <td className="px-4 py-2 text-right">{formatInr(order.total)}</td>
                    <td className="px-4 py-2 text-right text-green-700">{formatInr(order.paid)}</td>
                    <td className="px-4 py-2 text-right font-semibold text-destructive">
                      {formatInr(order.remaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </GuideTarget>
    </>
  );
}

function FollowUpCard({
  row,
  variant,
}: {
  row: (typeof DUMMY.paymentFollowUps.overdue)[number];
  variant: "overdue" | "dueToday" | "default";
}) {
  const cardClass =
    variant === "overdue" ? "bg-red-50" : variant === "dueToday" ? "bg-amber-50" : "bg-muted/40";
  return (
    <div className={`rounded-lg p-3 text-sm space-y-1 ${cardClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{row.followUpDate}</span>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline">{row.paymentStatus}</Badge>
          <span className="text-sm font-semibold text-destructive">{formatInr(row.balanceDue)}</span>
        </div>
      </div>
      <p className="text-muted-foreground">
        <span className="text-primary font-mono">{row.orderNumber}</span>
        {" · "}
        {row.customer}
        {row.mobile ? ` · ${row.mobile}` : ""}
      </p>
      <p className="whitespace-pre-wrap">{row.note}</p>
      <p className="text-xs text-muted-foreground">
        {row.createdBy} · {row.createdAt}
      </p>
    </div>
  );
}

function FollowUpsPanel({ activeHighlight }: { activeHighlight: string | null }) {
  const reminderCount =
    DUMMY.paymentFollowUps.overdue.length + DUMMY.paymentFollowUps.dueToday.length;

  return (
    <div className="space-y-6">
      <GuideTarget id="followups-reminders" activeHighlight={activeHighlight} label="Pending reminders">
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-600" />
            <h3 className="font-semibold">Pending reminders</h3>
            <Badge variant="outline">{reminderCount}</Badge>
          </div>
          {DUMMY.paymentFollowUps.overdue.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-destructive">
                Overdue ({DUMMY.paymentFollowUps.overdue.length})
              </p>
              {DUMMY.paymentFollowUps.overdue.map((row) => (
                <FollowUpCard key={row.id} row={row} variant="overdue" />
              ))}
            </div>
          ) : null}
          {DUMMY.paymentFollowUps.dueToday.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-amber-700">
                Due today ({DUMMY.paymentFollowUps.dueToday.length})
              </p>
              {DUMMY.paymentFollowUps.dueToday.map((row) => (
                <FollowUpCard key={row.id} row={row} variant="dueToday" />
              ))}
            </div>
          ) : null}
        </div>
      </GuideTarget>

      <GuideTarget id="followups-by-date" activeHighlight={activeHighlight} label="Follow-ups by date">
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-semibold">Follow-ups by date</h3>
              <p className="text-sm text-muted-foreground">Orders with due or partial payment only</p>
            </div>
            <GuideTarget
              id="followup-date-picker"
              activeHighlight={activeHighlight}
              label="Date picker"
              dimOthers={false}
            >
              <Input type="date" readOnly defaultValue="2026-06-13" className="w-[180px] bg-background" />
            </GuideTarget>
          </div>
          <FollowUpCard row={DUMMY.paymentFollowUps.dueToday[0]} variant="default" />
        </div>
      </GuideTarget>
    </div>
  );
}

function RecordPaymentDialog({ activeHighlight, showCheque = false }: { activeHighlight: string | null; showCheque?: boolean }) {
  const due = DUMMY.dueOrders[0].remaining;

  return (
    <GuideTarget id="payment-dialog" activeHighlight={activeHighlight} label="Record Payment dialog">
      <div className="rounded-lg border bg-card shadow-lg p-6 max-w-[560px] mx-auto mt-6 space-y-4">
        <p className="font-semibold">Record Payment</p>

        <GuideTarget id="order-picker" activeHighlight={activeHighlight} label="Order picker" dimOthers={false}>
          <div className="space-y-2">
            <Label>Order</Label>
            <Button type="button" variant="outline" className="w-full justify-between font-normal" disabled>
              {DUMMY.order.id} - {DUMMY.order.customer} (Remaining: {formatInr(due)})
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </div>
        </GuideTarget>

        <GuideTarget id="order-due-summary" activeHighlight={activeHighlight} label="Order balance summary" dimOthers={false}>
          <div className="bg-muted/50 p-3 rounded-md border text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Order Amount:</span>
              <span className="font-medium">{formatInr(DUMMY.dueOrders[0].total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Already Paid:</span>
              <span className="text-green-600 font-medium">{formatInr(DUMMY.dueOrders[0].paid)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t mt-1 font-bold">
              <span>Due Amount:</span>
              <span className="text-destructive">{formatInr(due)}</span>
            </div>
          </div>
        </GuideTarget>

        <div className="grid grid-cols-2 gap-4">
          <GuideTarget id="payment-amount" activeHighlight={activeHighlight} label="Amount" dimOthers={false}>
            <div className="space-y-2">
              <Label>Amount (₹) - Remaining: {formatInr(due)}</Label>
              <Input readOnly defaultValue={String(due)} className="bg-background" />
            </div>
          </GuideTarget>
          <GuideTarget id="payment-mode" activeHighlight={activeHighlight} label="Payment mode" dimOthers={false}>
            <div className="space-y-2">
              <Label>Payment Mode</Label>
              <div className="h-9 rounded-md border bg-background px-3 flex items-center text-sm">
                {showCheque ? "Cheque" : "UPI"}
              </div>
            </div>
          </GuideTarget>
        </div>

        {showCheque ? (
          <GuideTarget id="cheque-number" activeHighlight={activeHighlight} label="Cheque number" dimOthers={false}>
            <div className="space-y-2">
              <Label>Cheque number</Label>
              <Input readOnly placeholder="Cheque / instrument number" className="bg-background" />
            </div>
          </GuideTarget>
        ) : null}

        <GuideTarget id="payment-notes" activeHighlight={activeHighlight} label="Notes" dimOthers={false}>
          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Input readOnly placeholder="Transaction ID, Reference, etc." defaultValue="UPI ref UPI123456789" className="bg-background" />
          </div>
        </GuideTarget>

        <div className="flex justify-end gap-2 pt-4">
          <GuideTarget id="form-cancel" activeHighlight={activeHighlight} label="Cancel" dimOthers={false}>
            <Button type="button" variant="outline" disabled>
              Cancel
            </Button>
          </GuideTarget>
          <GuideTarget id="form-save" activeHighlight={activeHighlight} label="Record Payment" dimOthers={false}>
            <Button type="button" disabled>
              Record Payment
            </Button>
          </GuideTarget>
        </div>
      </div>
    </GuideTarget>
  );
}

function OrderRecordPaymentPreview({ activeHighlight }: { activeHighlight: string | null }) {
  const due = DUMMY.dueOrders[0].remaining;

  return (
    <LivePageRoot>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 max-w-5xl mx-auto">
        <div className="lg:col-span-7 space-y-6">
          <GuideTarget id="order-record-payment" activeHighlight={activeHighlight} label="Record payment section">
            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
              <h3 className="text-base font-semibold">Record payment</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <GuideTarget id="payment-amount" activeHighlight={activeHighlight} label="Amount" dimOthers={false}>
                  <Input readOnly placeholder="Amount (whole ₹)" defaultValue={String(due)} className="rounded-xl bg-background" />
                </GuideTarget>
                <GuideTarget id="payment-mode" activeHighlight={activeHighlight} label="Payment mode" dimOthers={false}>
                  <div className="h-10 rounded-xl border bg-background px-3 flex items-center text-sm">UPI</div>
                </GuideTarget>
                <GuideTarget id="payment-notes" activeHighlight={activeHighlight} label="Payment note" dimOthers={false} className="sm:col-span-2">
                  <Input readOnly placeholder="Payment note (optional)" className="rounded-xl bg-background" />
                </GuideTarget>
              </div>
              <GuideTarget id="form-save" activeHighlight={activeHighlight} label="Add payment" dimOthers={false}>
                <Button type="button" className="w-full rounded-xl" disabled>
                  Add payment
                </Button>
              </GuideTarget>

              <GuideTarget id="payment-history" activeHighlight={activeHighlight} label="Payment history">
                <div className="space-y-3 pt-2 border-t">
                  <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
                    <p className="text-sm flex items-center justify-between">
                      <span className="text-muted-foreground">Date</span>
                      <span className="font-medium text-primary/75">{DUMMY.payment.date}</span>
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Wallet className="h-4 w-4 shrink-0 opacity-70" />
                          <span>Advanced</span>
                        </div>
                        <p className="text-base font-semibold tabular-nums">{formatInr(10000)}</p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <CreditCard className="h-4 w-4 shrink-0 opacity-70" />
                          <span>Mode of Payment</span>
                        </div>
                        <p className="text-sm font-semibold">Cash</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
                    <p className="text-sm flex items-center justify-between">
                      <span className="text-muted-foreground">Date</span>
                      <span className="font-medium text-primary/75">{DUMMY.payment.date}</span>
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Wallet className="h-4 w-4 shrink-0 opacity-70" />
                          <span>1st payment</span>
                        </div>
                        <p className="text-base font-semibold tabular-nums">{formatInr(DUMMY.payment.amount)}</p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <CreditCard className="h-4 w-4 shrink-0 opacity-70" />
                          <span>Mode of Payment</span>
                        </div>
                        <p className="text-sm font-semibold">{DUMMY.payment.modeLabel}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{DUMMY.user} · {DUMMY.payment.notes}</p>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Remaining: <span className="text-foreground font-semibold">{formatInr(due)}</span>
                  </p>
                </div>
              </GuideTarget>
            </div>
          </GuideTarget>

          <GuideTarget id="order-followup-panel" activeHighlight={activeHighlight} label="Payment follow-ups">
            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" />
                  Payment Follow-ups
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Schedule reminders and notes while payment is due or partially paid.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Follow-up date</Label>
                  <Input type="date" readOnly defaultValue="2026-06-15" className="bg-background" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Note</Label>
                  <Textarea
                    readOnly
                    placeholder="Customer promised payment on…, call back, etc."
                    rows={2}
                    className="bg-background resize-none"
                  />
                </div>
              </div>
              <Button type="button" variant="secondary" disabled>
                Add follow-up
              </Button>
            </div>
          </GuideTarget>
        </div>

        <aside className="lg:col-span-5">
          <GuideTarget id="order-payment-summary" activeHighlight={activeHighlight} label="Payment summary">
            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-3">
              <h3 className="text-base font-semibold">Payment summary</h3>
              <div className="rounded-xl border bg-muted/15 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span className="text-xl font-bold tabular-nums">{formatInr(DUMMY.dueOrders[0].total)}</span>
                </div>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="font-medium text-green-700 tabular-nums">{formatInr(DUMMY.dueOrders[0].paid)}</span>
                </div>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Due Amount</span>
                  <span className="font-semibold tabular-nums">{formatInr(due)}</span>
                </div>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Payment status</span>
                  <span className="font-medium">{DUMMY.order.payment}</span>
                </div>
              </div>
            </div>
          </GuideTarget>
        </aside>
      </div>
    </LivePageRoot>
  );
}

export function GuideLivePaymentsPreview({ screenId, activeHighlight }: PaymentsPreviewProps) {
  if (screenId === "payments-record-order") {
    return <OrderRecordPaymentPreview activeHighlight={activeHighlight} />;
  }

  if (screenId === "payments-list") {
    return (
      <LivePageRoot>
        <PaymentsPageHeader activeHighlight={activeHighlight} />
        <PaymentsTabsShell activeTab="payments" activeHighlight={activeHighlight}>
          <TabsContent value="payments" className="space-y-4">
            <AllPaymentsFilters activeHighlight={activeHighlight} />
            <PaymentsTable activeHighlight={activeHighlight} />
          </TabsContent>
        </PaymentsTabsShell>
      </LivePageRoot>
    );
  }

  if (screenId === "payments-due") {
    return (
      <LivePageRoot>
        <PaymentsPageHeader activeHighlight={activeHighlight} />
        <PaymentsTabsShell activeTab="due" activeHighlight={activeHighlight}>
          <TabsContent value="due" className="space-y-4">
            <DueOrdersPanel activeHighlight={activeHighlight} />
          </TabsContent>
        </PaymentsTabsShell>
      </LivePageRoot>
    );
  }

  if (screenId === "payments-followups") {
    return (
      <LivePageRoot>
        <PaymentsPageHeader activeHighlight={activeHighlight} />
        <PaymentsTabsShell activeTab="followups" activeHighlight={activeHighlight}>
          <TabsContent value="followups" className="space-y-4">
            <FollowUpsPanel activeHighlight={activeHighlight} />
          </TabsContent>
        </PaymentsTabsShell>
      </LivePageRoot>
    );
  }

  if (screenId === "payments-record") {
    return (
      <LivePageRoot>
        <PaymentsPageHeader activeHighlight={activeHighlight} />
        <PaymentsTabsShell activeTab="payments" activeHighlight={activeHighlight}>
          <TabsContent value="payments" className="space-y-4">
            <AllPaymentsFilters activeHighlight={activeHighlight} />
            <PaymentsTable activeHighlight={activeHighlight} />
          </TabsContent>
        </PaymentsTabsShell>
        <RecordPaymentDialog activeHighlight={activeHighlight} />
      </LivePageRoot>
    );
  }

  return (
    <LivePageRoot>
      <PaymentsPageHeader activeHighlight={activeHighlight} />
      <PaymentsTabsShell activeTab="payments" activeHighlight={activeHighlight}>
        <TabsContent value="payments" className="space-y-4">
          <AllPaymentsFilters activeHighlight={activeHighlight} />
          <PaymentsTable activeHighlight={activeHighlight} />
        </TabsContent>
      </PaymentsTabsShell>
    </LivePageRoot>
  );
}
