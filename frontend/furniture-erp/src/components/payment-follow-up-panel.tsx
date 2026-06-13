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
  formatPaymentStatusLabel,
} from "@/lib/payment-follow-up-api";
import { CalendarClock, Bell } from "lucide-react";
import { localTodayYmd, isPastYmdDate } from "@/lib/date-range";
import { formatErrorMessage } from "@/lib/error-message";
import { formatInr } from "@/lib/format-currency";

function FollowUpCard({
  row,
  showOrderLink,
  variant = "default",
}: {
  row: PaymentFollowUpRow;
  showOrderLink?: boolean;
  variant?: "default" | "overdue" | "dueToday";
}) {
  const order = row.order;
  const cardClass =
    variant === "overdue"
      ? "bg-red-50"
      : variant === "dueToday"
        ? "bg-amber-50 dark:bg-amber-950/20"
        : "bg-muted/40";

  return (
    <div className={`rounded-lg p-3 text-sm space-y-1 ${cardClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{row.followUpDate}</span>
        {order ? (
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline">{formatPaymentStatusLabel(order.paymentStatus)}</Badge>
            <span className="text-sm font-semibold text-destructive">
              {formatInr(order.balanceDue)}
            </span>
          </div>
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
      toast({ title: "Failed", description: formatErrorMessage(err), variant: "destructive" }),
  });

  const handleAddFollowUp = () => {
    if (isPastYmdDate(followUpDate)) {
      toast({
        title: "Invalid follow-up date",
        description: "Please choose today or a future date.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate();
  };

  const rows = data?.data ?? [];

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm md:p-6 space-y-4">

      <div className="space-y-0.5">
        <h3 className="text-base font-semibold">
          Payment Follow-ups
        </h3>
        <p className="text-sm text-muted-foreground">
          Schedule reminders and notes while payment is due or partially paid.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium">Follow-up date</label>
          <Input
            type="date"
            min={localTodayYmd()}
            value={followUpDate}
            onChange={(e) => {
              const next = e.target.value;
              setFollowUpDate(isPastYmdDate(next) ? localTodayYmd() : next);
            }}
          />
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
        disabled={!note.trim() || !followUpDate || createMutation.isPending || isPastYmdDate(followUpDate)}
        onClick={handleAddFollowUp}
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
                <FollowUpCard key={`o-${row.id}`} row={row} showOrderLink variant="overdue" />
              ))}
            </div>
          )}
          {dueToday.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-amber-700">Due today ({dueToday.length})</p>
              {dueToday.map((row) => (
                <FollowUpCard key={`t-${row.id}`} row={row} showOrderLink variant="dueToday" />
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
