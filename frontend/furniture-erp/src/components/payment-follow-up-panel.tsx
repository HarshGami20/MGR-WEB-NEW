import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  createOrderPaymentFollowUp,
  listOrderPaymentFollowUps,
  listPaymentFollowUpsByDate,
  listPaymentFollowUpReminders,
  type PaymentFollowUpRow,
} from "@/lib/payment-follow-up-api";
import { CalendarClock, Bell } from "lucide-react";

function localTodayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function FollowUpCard({ row, showOrderLink }: { row: PaymentFollowUpRow; showOrderLink?: boolean }) {
  const order = row.order;
  return (
    <div className="rounded-md border p-3 text-sm space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{row.followUpDate}</span>
        {order ? (
          <Badge variant="outline" className="capitalize">
            {order.paymentStatus.replace("_", " ")}
          </Badge>
        ) : null}
      </div>
      {showOrderLink && order ? (
        <p className="text-muted-foreground">
          <Link href={`/orders/${order.id}`} className="text-primary hover:underline font-mono">
            {order.orderNumber}
          </Link>
          {" · "}
          {order.customerName}
          {order.customerMobile ? ` · ${order.customerMobile}` : ""}
        </p>
      ) : null}
      {order ? (
        <p className="text-xs text-muted-foreground">
          Balance due: <span className="font-semibold text-destructive">₹{order.balanceDue.toLocaleString()}</span>
        </p>
      ) : null}
      <p className="whitespace-pre-wrap">{row.note}</p>
      <p className="text-xs text-muted-foreground">
        {row.createdBy?.name ? `${row.createdBy.name} · ` : ""}
        {new Date(row.createdAt).toLocaleString()}
      </p>
    </div>
  );
}

/** Order detail: schedule follow-ups when payment is due or partially paid. */
export function OrderPaymentFollowUpPanel({ orderId }: { orderId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [followUpDate, setFollowUpDate] = useState(localTodayYmd());
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["orderPaymentFollowUps", orderId],
    queryFn: () => listOrderPaymentFollowUps(orderId),
  });

  const createMutation = useMutation({
    mutationFn: () => createOrderPaymentFollowUp(orderId, { followUpDate, note: note.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orderPaymentFollowUps", orderId] });
      queryClient.invalidateQueries({ queryKey: ["paymentFollowUpsByDate"] });
      queryClient.invalidateQueries({ queryKey: ["paymentFollowUpReminders"] });
      setNote("");
      toast({ title: "Follow-up scheduled" });
    },
    onError: (err: Error) =>
      toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const rows = data?.data ?? [];

  return (
    <div className="rounded-xl border border-border/60 p-4 space-y-4">
      <h3 className="text-xl font-semibold flex items-center gap-2">
        <CalendarClock className="h-5 w-5" />
        Payment follow-up
      </h3>
      <p className="text-sm text-muted-foreground">
        Schedule reminders and notes while payment is due or partially paid.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium">Follow-up date</label>
          <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium">Note</label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Customer promised payment on…, call back, etc."
            rows={2}
          />
        </div>
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={!note.trim() || !followUpDate || createMutation.isPending}
        onClick={() => createMutation.mutate()}
      >
        Add follow-up
      </Button>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No follow-ups yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <FollowUpCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Payments page: date-wise list + pending reminders. */
export function PaymentFollowUpsCalendar({ branchId }: { branchId?: number | null }) {
  const [selectedDate, setSelectedDate] = useState(localTodayYmd());

  const { data: reminders } = useQuery({
    queryKey: ["paymentFollowUpReminders", branchId],
    queryFn: () => listPaymentFollowUpReminders(branchId),
  });

  const { data: byDate, isLoading } = useQuery({
    queryKey: ["paymentFollowUpsByDate", selectedDate, branchId],
    queryFn: () => listPaymentFollowUpsByDate({ date: selectedDate, branchId }),
  });

  const overdue = reminders?.overdue ?? [];
  const dueToday = reminders?.dueToday ?? [];
  const dayRows = byDate?.data ?? [];

  return (
    <div className="space-y-6">
      {(overdue.length > 0 || dueToday.length > 0) && (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-600" />
            <h3 className="font-semibold">Pending reminders</h3>
            <Badge variant="outline">{reminders?.counts.total ?? 0}</Badge>
          </div>
          {overdue.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-destructive">Overdue ({overdue.length})</p>
              {overdue.map((row) => (
                <FollowUpCard key={`o-${row.id}`} row={row} showOrderLink />
              ))}
            </div>
          )}
          {dueToday.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-amber-700">Due today ({dueToday.length})</p>
              {dueToday.map((row) => (
                <FollowUpCard key={`t-${row.id}`} row={row} showOrderLink />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold">Follow-ups by date</h3>
            <p className="text-sm text-muted-foreground">Orders with due or partial payment only</p>
          </div>
          <Input
            type="date"
            className="w-[180px]"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : dayRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No follow-ups on this date.</p>
        ) : (
          <div className="space-y-2">
            {dayRows.map((row) => (
              <FollowUpCard key={row.id} row={row} showOrderLink />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
