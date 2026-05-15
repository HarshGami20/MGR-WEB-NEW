import { useCallback, useEffect, useMemo, useState } from "react";
import { format, addDays } from "date-fns";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useListBranches, useListOrders, type Branch } from "@/api-client";
import { DeliveryProgressKpi } from "@/components/delivery-progress-kpi";
import { DeliveryScheduleList } from "@/components/delivery-schedule-list";
import {
  addDaysYmd,
  computeDeliveryDayStats,
  localTodayYmd,
  normalizeYmdRange,
  type DeliveryOrderRow,
} from "@/lib/delivery-stats";
import { useBranch, assignedUserBranchIds } from "@/lib/branch-context";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import {
  fetchDeliverySlots,
  createDeliverySlotsBatch,
  updateDeliverySlot,
  deleteDeliverySlot,
  type DeliverySlotRow,
} from "@/lib/delivery-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GitBranch, Plus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Match backend: JS getUTCDay() — 0 Sun … 6 Sat */
const WEEKDAY_TOGGLES: { label: string; value: number }[] = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
  { label: "Sun", value: 0 },
];

const TIME_MODES = [
  { value: "morning", label: "Morning (9:00–12:00)" },
  { value: "afternoon", label: "Afternoon (12:00–15:00)" },
  { value: "evening", label: "Evening (16:00–20:00)" },
  { value: "full_day", label: "Full day (10:00–18:00)" },
  { value: "custom", label: "Custom start / end" },
] as const;

type TimeMode = (typeof TIME_MODES)[number]["value"];

function parseUtcYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
}

const PRESET_TIMES: Record<Exclude<TimeMode, "custom">, [string, string]> = {
  morning: ["09:00", "12:00"],
  afternoon: ["12:00", "15:00"],
  evening: ["16:00", "20:00"],
  full_day: ["10:00", "18:00"],
};

function countPlannedSlots(params: {
  fromDate: string;
  toDate: string;
  weekdays: number[];
  timeMode: TimeMode;
  startTime: string;
  endTime: string;
}): number {
  const from = parseUtcYmd(params.fromDate);
  const to = parseUtcYmd(params.toDate);
  if (!from || !to || from.getTime() > to.getTime()) return 0;
  const set = new Set(params.weekdays);
  let n = 0;
  let cur = new Date(from.getTime());
  const end = to.getTime();
  while (cur.getTime() <= end) {
    if (set.has(cur.getUTCDay())) n += 1;
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate() + 1));
  }
  return n;
}

function tableRangeUtc(anchor: Date): { from: string; to: string } {
  const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
  const end = addDays(start, 55);
  return {
    from: format(start, "yyyy-MM-dd"),
    to: format(end, "yyyy-MM-dd"),
  };
}

function slotYmd(slotDate: string): string {
  const s = String(slotDate).trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/** Branch list for /deliveries when no working branch: prefer API, else `/auth/me` branches, else id stubs (GET /branches needs branches:read). */
function pickableBranchesForDeliveries(
  assigned: number[],
  apiBranches: Branch[] | undefined,
  userBranches: Branch[] | undefined,
): Branch[] {
  const list = apiBranches ?? [];
  if (assigned.length === 0) return list;

  const fromApi = list.filter((b) => assigned.includes(b.id));
  if (fromApi.length > 0) return fromApi;

  const fromUser = (userBranches ?? []).filter((b) => assigned.includes(b.id) && b.isActive);
  if (fromUser.length > 0) return fromUser;

  return assigned.map(
    (id): Branch => ({
      id,
      name: `Branch #${id}`,
      code: "",
      isActive: true,
      createdAt: "",
    }),
  );
}

export default function DeliveriesPage() {
  const { user } = useAuth();
  const { selectedBranchId, setSelectedBranchId } = useBranch();
  const assigned = assignedUserBranchIds(user);
  const {
    data: branchesData,
    isLoading: branchesLoading,
    isError: branchesListError,
  } = useListBranches({ isActive: true, limit: 200 });
  const writeBranchId =
    assigned.length === 1
      ? assigned[0]!
      : assigned.length > 1
        ? selectedBranchId != null && assigned.includes(selectedBranchId)
          ? selectedBranchId
          : null
        : selectedBranchId;
  const { can } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [anchor] = useState(() => new Date());
  const range = useMemo(() => tableRangeUtc(anchor), [anchor]);

  const pickableBranches = useMemo(
    () => pickableBranchesForDeliveries(assigned, branchesData?.data, user?.branches),
    [assigned, branchesData?.data, user?.branches],
  );

  const branchPickerLoading = branchesLoading && pickableBranches.length === 0;

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState({
    fromDate: format(new Date(), "yyyy-MM-dd"),
    toDate: format(addDays(new Date(), 55), "yyyy-MM-dd"),
    weekdays: [1, 2, 3, 4, 5] as number[],
    timeMode: "morning" as TimeMode,
    startTime: "09:00",
    endTime: "12:00",
    labelPrefix: "",
    maxOrders: 10,
    pincodesCsv: "",
  });

  const [selectedSlotIds, setSelectedSlotIds] = useState<number[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const [filterLabel, setFilterLabel] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterPincode, setFilterPincode] = useState("");
  const [filterAvailability, setFilterAvailability] = useState<"all" | "available" | "full">("all");

  const [bookedDateFrom, setBookedDateFrom] = useState(() => localTodayYmd());
  const [bookedDateTo, setBookedDateTo] = useState(() => addDaysYmd(localTodayYmd(), 28));

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<DeliverySlotRow | null>(null);
  const [editForm, setEditForm] = useState({
    slotDate: "",
    label: "",
    startTime: "10:00",
    endTime: "12:00",
    maxOrders: 10,
    pincodesCsv: "",
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["deliverySlots", writeBranchId, range.from, range.to],
    queryFn: () =>
      fetchDeliverySlots({
        branchId: writeBranchId!,
        from: range.from,
        to: range.to,
      }),
    enabled: writeBranchId != null && can("deliveries", "view"),
  });

  const todayYmd = localTodayYmd();
  const bookedRange = useMemo(
    () => normalizeYmdRange(bookedDateFrom, bookedDateTo),
    [bookedDateFrom, bookedDateTo],
  );
  const bookedRangeActive = bookedDateFrom !== todayYmd || bookedDateTo !== addDaysYmd(todayYmd, 28);
  const canViewOrders = can("orders", "view");
  const canUpdateDeliveryStatus = can("deliveries", "edit") || can("orders", "edit");

  const { data: ordersData, isLoading: ordersLoading } = useListOrders(
    {
      page: 1,
      limit: 1000,
      branchId: writeBranchId ?? undefined,
    },
    { query: { enabled: writeBranchId != null && canViewOrders } },
  );
  const deliveryOrders = (ordersData?.data ?? []) as DeliveryOrderRow[];
  const todaySlotCapacity = rows
    .filter((s) => slotYmd(s.slotDate) === todayYmd)
    .reduce((sum, s) => sum + s.maxOrders, 0);
  const todayDeliveryStats = computeDeliveryDayStats(
    deliveryOrders,
    todayYmd,
    todaySlotCapacity,
  );

  const filteredRows = useMemo(() => {
    const labelQ = filterLabel.trim().toLowerCase();
    const pinQ = filterPincode.trim().toLowerCase();
    let fromQ = filterDateFrom.trim();
    let toQ = filterDateTo.trim();
    if (fromQ && toQ && fromQ > toQ) {
      const t = fromQ;
      fromQ = toQ;
      toQ = t;
    }
    return rows.filter((r) => {
      if (labelQ && !r.label.toLowerCase().includes(labelQ)) return false;
      const ymd = slotYmd(r.slotDate);
      if (fromQ && ymd < fromQ) return false;
      if (toQ && ymd > toQ) return false;
      if (filterAvailability === "available" && r.remaining <= 0) return false;
      if (filterAvailability === "full" && r.remaining > 0) return false;
      if (pinQ) {
        const pins = r.servicePincodes ?? [];
        if (pins.length === 0) return true;
        return pins.some((p) => p.toLowerCase().includes(pinQ));
      }
      return true;
    });
  }, [rows, filterLabel, filterDateFrom, filterDateTo, filterPincode, filterAvailability]);

  const filtersActive = useMemo(
    () =>
      Boolean(
        filterLabel.trim() ||
          filterDateFrom.trim() ||
          filterDateTo.trim() ||
          filterPincode.trim() ||
          filterAvailability !== "all",
      ),
    [filterLabel, filterDateFrom, filterDateTo, filterPincode, filterAvailability],
  );

  const resetTableFilters = useCallback(() => {
    setFilterLabel("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterPincode("");
    setFilterAvailability("all");
  }, []);

  const resetBookedDateRange = useCallback(() => {
    setBookedDateFrom(todayYmd);
    setBookedDateTo(addDaysYmd(todayYmd, 28));
  }, [todayYmd]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["deliverySlots", writeBranchId, range.from, range.to] });

  const plannedCount = useMemo(() => {
    const [st, et] =
      bulk.timeMode === "custom"
        ? [bulk.startTime, bulk.endTime]
        : PRESET_TIMES[bulk.timeMode as Exclude<TimeMode, "custom">];
    return countPlannedSlots({
      fromDate: bulk.fromDate,
      toDate: bulk.toDate,
      weekdays: bulk.weekdays,
      timeMode: bulk.timeMode,
      startTime: st,
      endTime: et,
    });
  }, [bulk]);

  const batchMut = useMutation({
    mutationFn: () => {
      const pins = bulk.pincodesCsv
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const body: Parameters<typeof createDeliverySlotsBatch>[1] = {
        fromDate: bulk.fromDate,
        toDate: bulk.toDate,
        weekdays: [...bulk.weekdays].sort((a, b) => a - b),
        timeMode: bulk.timeMode,
        maxOrders: bulk.maxOrders,
        servicePincodes: pins,
        ...(bulk.labelPrefix.trim() ? { labelPrefix: bulk.labelPrefix.trim() } : {}),
        ...(bulk.timeMode === "custom"
          ? { startTime: bulk.startTime, endTime: bulk.endTime }
          : {}),
      };
      return createDeliverySlotsBatch(writeBranchId!, body);
    },
    onSuccess: (res) => {
      const parts = [`${res.created} slot(s) created`];
      if (res.skippedDuplicates) parts.push(`${res.skippedDuplicates} already existed`);
      if (res.skippedOverflow) parts.push(`${res.skippedOverflow} over limit (500/run)`);
      toast({ title: "Slots saved", description: parts.join(" · ") });
      setBulkOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast({ title: "Batch failed", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      updateDeliverySlot(writeBranchId!, editing!.id, {
        slotDate: editForm.slotDate,
        label: editForm.label.trim(),
        startTime: editForm.startTime,
        endTime: editForm.endTime,
        maxOrders: editForm.maxOrders,
        servicePincodes: editForm.pincodesCsv
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      toast({ title: "Slot updated" });
      setEditOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteDeliverySlot(writeBranchId!, id),
    onSuccess: () => {
      toast({ title: "Slot deleted" });
      invalidate();
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: number[]) => {
      const failed: { id: number; message: string }[] = [];
      let deleted = 0;
      for (const id of ids) {
        try {
          await deleteDeliverySlot(writeBranchId!, id);
          deleted += 1;
        } catch (e) {
          failed.push({ id, message: e instanceof Error ? e.message : String(e) });
        }
      }
      return { deleted, failed };
    },
    onSuccess: (res) => {
      invalidate();
      const { deleted, failed } = res;
      setSelectedSlotIds((prev) => prev.filter((id) => failed.some((f) => f.id === id)));
      setBulkDeleteOpen(false);
      if (deleted > 0) {
        toast({ title: `${deleted} slot(s) deleted` });
      }
      if (failed.length > 0) {
        toast({
          title: `${failed.length} deletion(s) failed`,
          description: failed
            .slice(0, 3)
            .map((f) => `#${f.id}: ${f.message}`)
            .join(" · "),
          variant: "destructive",
        });
      }
    },
    onError: (e: Error) =>
      toast({ title: "Bulk delete failed", description: e.message, variant: "destructive" }),
  });

  const rowIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  useEffect(() => {
    setSelectedSlotIds((prev) => {
      const next = prev.filter((id) => rowIds.has(id));
      if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev;
      return next;
    });
  }, [rowIds]);

  const selectedCount = selectedSlotIds.length;
  const allFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selectedSlotIds.includes(r.id));
  const someFilteredSelected = filteredRows.some((r) => selectedSlotIds.includes(r.id));

  const toggleSelectAllRows = (checked: boolean) => {
    if (checked) {
      setSelectedSlotIds((prev) => Array.from(new Set([...prev, ...filteredRows.map((r) => r.id)])));
    } else {
      const visible = new Set(filteredRows.map((r) => r.id));
      setSelectedSlotIds((prev) => prev.filter((id) => !visible.has(id)));
    }
  };

  const toggleSelectSlot = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedSlotIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    } else {
      setSelectedSlotIds((prev) => prev.filter((x) => x !== id));
    }
  };

  const openBulk = useCallback(() => {
    setBulk({
      fromDate: format(new Date(), "yyyy-MM-dd"),
      toDate: format(addDays(new Date(), 55), "yyyy-MM-dd"),
      weekdays: [1, 2, 3, 4, 5],
      timeMode: "morning",
      startTime: "09:00",
      endTime: "12:00",
      labelPrefix: "",
      maxOrders: 10,
      pincodesCsv: "",
    });
    setBulkOpen(true);
  }, []);

  const toggleWeekday = (v: number) => {
    setBulk((b) => ({
      ...b,
      weekdays: b.weekdays.includes(v) ? b.weekdays.filter((x) => x !== v) : [...b.weekdays, v].sort((a, c) => a - c),
    }));
  };

  const openEdit = useCallback((row: DeliverySlotRow) => {
    setEditing(row);
    const d = row.slotDate.includes("T") ? row.slotDate.slice(0, 10) : row.slotDate;
    setEditForm({
      slotDate: d,
      label: row.label,
      startTime: row.startTime,
      endTime: row.endTime,
      maxOrders: row.maxOrders,
      pincodesCsv: (row.servicePincodes ?? []).join(", "),
    });
    setEditOpen(true);
  }, []);

  if (!can("deliveries", "view")) {
    return <p className="text-muted-foreground p-6">You do not have access to delivery management.</p>;
  }

  if (writeBranchId == null) {
    const branchesSorted = [...pickableBranches].sort((a, b) => a.name.localeCompare(b.name));
    return (
      <div className="p-4 md:p-6 max-w-5xl space-y-4">
        <Card className="border bg-card text-card-foreground shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-primary shrink-0" />
              Select branch
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Delivery slots are per location. With <strong>All branches</strong> in the header, choose a location below or
              from the header menu.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {branchPickerLoading ? (
              <p className="text-sm text-muted-foreground">Loading branches…</p>
            ) : pickableBranches.length === 0 ? (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  No branches could be loaded. You may need <span className="text-foreground font-medium">Branches → View</span>{" "}
                  permission to list all locations, or ask an admin to assign you to a branch.
                </p>
                {branchesListError ? (
                  <p className="text-destructive">Branch list request failed (for example, forbidden without branches access).</p>
                ) : null}
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">Locations</p>
                <div
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                  role="list"
                  aria-label="Branches to manage delivery slots"
                >
                  {branchesSorted.map((b) => {
                    const isSelected = selectedBranchId === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        role="listitem"
                        onClick={() => setSelectedBranchId(b.id)}
                        className={cn(
                          "flex flex-col items-stretch gap-1.5 rounded-lg border bg-background p-4 text-left transition-colors",
                          "hover:bg-accent/40 hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                          isSelected && "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/25",
                        )}
                      >
                        <span className="flex items-start gap-2.5 min-w-0">
                          <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 font-medium leading-snug text-foreground">{b.name}</span>
                            {b.code ? (
                              <span className="mt-0.5 block font-mono text-xs text-muted-foreground">{b.code}</span>
                            ) : null}
                          </span>
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">ID {b.id}</span>
                      </button>
                    );
                  })}
                </div>
                {branchesListError && assigned.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Full branch list is unavailable; showing your assigned locations from your profile.
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const canCreate = bulk.weekdays.length > 0 && plannedCount > 0;

  return (
    <div className="space-y-6 p-1">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Delivery slots</h2>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Manage time windows, capacity, and optional pincode rules for this branch.
          </p>
        </div>
        {can("deliveries", "add") ? (
          <Button onClick={openBulk}>
            <Plus className="mr-2 h-4 w-4" />
            Add slots
          </Button>
        ) : null}
      </div>
{/* 
      <DeliveryProgressKpi
        stats={todayDeliveryStats}
        loading={ordersLoading || isLoading}
        linkHref="/deliveries"
      /> */}

      <Tabs defaultValue="booked" className="space-y-4">
        <TabsList>
          <TabsTrigger value="booked">Booked deliveries</TabsTrigger>
          <TabsTrigger value="slots">Delivery slots</TabsTrigger>
        </TabsList>

        <TabsContent value="booked">
          <Card>
            <CardHeader>
              <CardTitle>Booked deliveries</CardTitle>
              <CardDescription>
                Orders grouped by delivery date and time slot. Update delivery status inline.
                {bookedRange.fromYmd && bookedRange.toYmd ? (
                  <span className="block mt-1 text-foreground/90 tabular-nums">
                    Showing {bookedRange.fromYmd} → {bookedRange.toYmd}
                  </span>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">Date range</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-muted-foreground"
                    onClick={resetBookedDateRange}
                    disabled={!bookedRangeActive}
                  >
                    Reset range
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                  <div className="grid gap-1.5">
                    <Label htmlFor="booked-filter-from" className="text-xs">
                      From date
                    </Label>
                    <Input
                      id="booked-filter-from"
                      type="date"
                      value={bookedDateFrom}
                      onChange={(e) => setBookedDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="booked-filter-to" className="text-xs">
                      To date
                    </Label>
                    <Input
                      id="booked-filter-to"
                      type="date"
                      value={bookedDateTo}
                      onChange={(e) => setBookedDateTo(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {!canViewOrders ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Orders view permission is required to see booked deliveries.
                </p>
              ) : !bookedRange.fromYmd || !bookedRange.toYmd ? (
                <p className="text-sm text-muted-foreground py-6 text-center rounded-xl border border-dashed">
                  Select both a from and to date to view booked deliveries.
                </p>
              ) : (
                <DeliveryScheduleList
                  orders={deliveryOrders}
                  slots={rows}
                  branchId={writeBranchId}
                  fromYmd={bookedRange.fromYmd}
                  toYmd={bookedRange.toYmd}
                  loading={ordersLoading}
                  canUpdateStatus={canUpdateDeliveryStatus}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="slots">
          <Card>
            <CardHeader>
              <CardTitle>Next 8 weeks</CardTitle>
              <CardDescription>
                {range.from} → {range.to} · Branch #{writeBranchId}
                {filtersActive && rows.length > 0 ? (
                  <span className="block mt-1 text-foreground/90">
                    Showing {filteredRows.length} of {rows.length} slot{rows.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No slots in this window. Use Add slots to generate them.
                </p>
              ) : (
                <>
                  <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:p-4">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">Filters</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-muted-foreground"
                        onClick={resetTableFilters}
                        disabled={!filtersActive}
                      >
                        Reset filters
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                      <div className="grid gap-1.5 sm:col-span-2">
                        <Label htmlFor="slot-filter-label" className="text-xs">
                          Label contains
                        </Label>
                        <Input
                          id="slot-filter-label"
                          placeholder="e.g. Morning, Van 1"
                          value={filterLabel}
                          onChange={(e) => setFilterLabel(e.target.value)}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="slot-filter-from" className="text-xs">
                          From date
                        </Label>
                        <Input
                          id="slot-filter-from"
                          type="date"
                          value={filterDateFrom}
                          min={range.from}
                          max={range.to}
                          onChange={(e) => setFilterDateFrom(e.target.value)}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="slot-filter-to" className="text-xs">
                          To date
                        </Label>
                        <Input
                          id="slot-filter-to"
                          type="date"
                          value={filterDateTo}
                          min={range.from}
                          max={range.to}
                          onChange={(e) => setFilterDateTo(e.target.value)}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="slot-filter-pin" className="text-xs">
                          Pincode
                        </Label>
                        <Input
                          id="slot-filter-pin"
                          placeholder="Matches list or all pincodes"
                          value={filterPincode}
                          onChange={(e) => setFilterPincode(e.target.value)}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Capacity</Label>
                        <Select
                          value={filterAvailability}
                          onValueChange={(v) => setFilterAvailability(v as "all" | "available" | "full")}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="available">Has availability</SelectItem>
                            <SelectItem value="full">Fully booked</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {can("deliveries", "delete") && selectedCount > 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2.5 mb-3">
                      <span className="text-sm text-muted-foreground">{selectedCount} slot(s) selected</span>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" type="button" onClick={() => setSelectedSlotIds([])}>
                          Clear
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          type="button"
                          onClick={() => setBulkDeleteOpen(true)}
                          disabled={bulkDeleteMut.isPending}
                        >
                          Delete selected
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {filteredRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground rounded-md border border-dashed px-4 py-6 text-center">
                      No slots match your filters.
                      <button
                        type="button"
                        className="ml-1 text-primary underline-offset-4 hover:underline font-medium"
                        onClick={resetTableFilters}
                      >
                        Reset filters
                      </button>
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {can("deliveries", "delete") ? (
                            <TableHead className="w-[44px] pr-0">
                              <Checkbox
                                checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                                onCheckedChange={(v) => toggleSelectAllRows(Boolean(v))}
                                disabled={bulkDeleteMut.isPending || filteredRows.length === 0}
                                aria-label="Select all slots matching current filters"
                              />
                            </TableHead>
                          ) : null}
                          <TableHead>Date</TableHead>
                          <TableHead>Window</TableHead>
                          <TableHead>Label</TableHead>
                          <TableHead className="text-right">Capacity</TableHead>
                          <TableHead>Pincodes</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRows.map((r) => (
                          <TableRow
                            key={r.id}
                            className={selectedSlotIds.includes(r.id) ? "bg-muted/40" : undefined}
                          >
                            {can("deliveries", "delete") ? (
                              <TableCell className="w-[44px] pr-0">
                                <Checkbox
                                  checked={selectedSlotIds.includes(r.id)}
                                  onCheckedChange={(v) => toggleSelectSlot(r.id, Boolean(v))}
                                  disabled={bulkDeleteMut.isPending}
                                  aria-label={`Select slot ${r.label}`}
                                />
                              </TableCell>
                            ) : null}
                            <TableCell className="whitespace-nowrap">
                              {r.slotDate?.toString?.().slice(0, 10) ?? r.slotDate}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {r.startTime}–{r.endTime}
                            </TableCell>
                            <TableCell>{r.label}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.bookedCount}/{r.maxOrders}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                              {(r.servicePincodes ?? []).length ? (r.servicePincodes ?? []).join(", ") : "All"}
                            </TableCell>
                            <TableCell className="text-right">
                              {can("deliveries", "edit") ? (
                                <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              ) : null}
                              {can("deliveries", "delete") ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    if (confirm("Delete this slot?")) deleteMut.mutate(r.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-lg sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create delivery slots (bulk)</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>From</Label>
                <Input type="date" value={bulk.fromDate} onChange={(e) => setBulk((b) => ({ ...b, fromDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>To (inclusive)</Label>
                <Input type="date" value={bulk.toDate} onChange={(e) => setBulk((b) => ({ ...b, toDate: e.target.value }))} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Repeat on</Label>
              <div className="flex flex-wrap gap-3">
                {WEEKDAY_TOGGLES.map(({ label, value }) => (
                  <label
                    key={value}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                      bulk.weekdays.includes(value) ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                    )}
                  >
                    <Checkbox
                      checked={bulk.weekdays.includes(value)}
                      onCheckedChange={() => toggleWeekday(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Time</Label>
              <Select value={bulk.timeMode} onValueChange={(v) => setBulk((b) => ({ ...b, timeMode: v as TimeMode }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {bulk.timeMode === "custom" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Start</Label>
                  <Input type="time" value={bulk.startTime} onChange={(e) => setBulk((b) => ({ ...b, startTime: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>End</Label>
                  <Input type="time" value={bulk.endTime} onChange={(e) => setBulk((b) => ({ ...b, endTime: e.target.value }))} />
                </div>
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label>Name prefix (optional)</Label>
              <Input
                value={bulk.labelPrefix}
                onChange={(e) => setBulk((b) => ({ ...b, labelPrefix: e.target.value }))}
                placeholder="e.g. Van 1 — labels become “Van 1 · Mon 2026-05-12”"
              />
            </div>

            <div className="grid gap-2">
              <Label>Max orders per slot</Label>
              <Input
                type="number"
                min={1}
                value={bulk.maxOrders}
                onChange={(e) => setBulk((b) => ({ ...b, maxOrders: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>Pincodes (optional)</Label>
              <Input
                value={bulk.pincodesCsv}
                onChange={(e) => setBulk((b) => ({ ...b, pincodesCsv: e.target.value }))}
                placeholder="Comma-separated; empty = all pincodes"
              />
            </div>

            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{plannedCount}</span> calendar day
              {plannedCount === 1 ? "" : "s"} match your weekdays in this range (existing identical slots are skipped).
              Up to <span className="font-medium text-foreground">500</span> new rows per save.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => batchMut.mutate()} disabled={!canCreate || batchMut.isPending}>
              {batchMut.isPending ? "Creating…" : `Create ${Math.min(plannedCount, 500)} slot(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit slot</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>Date</Label>
              <Input type="date" value={editForm.slotDate} onChange={(e) => setEditForm((f) => ({ ...f, slotDate: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Label</Label>
              <Input value={editForm.label} onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Start</Label>
                <Input type="time" value={editForm.startTime} onChange={(e) => setEditForm((f) => ({ ...f, startTime: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>End</Label>
                <Input type="time" value={editForm.endTime} onChange={(e) => setEditForm((f) => ({ ...f, endTime: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Max orders</Label>
              <Input
                type="number"
                min={1}
                value={editForm.maxOrders}
                onChange={(e) => setEditForm((f) => ({ ...f, maxOrders: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Pincodes</Label>
              <Input value={editForm.pincodesCsv} onChange={(e) => setEditForm((f) => ({ ...f, pincodesCsv: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => updateMut.mutate()} disabled={!editForm.label.trim() || updateMut.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} slot(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Orders linked to these slots will have the slot reference cleared; delivery dates are
              unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteMut.isPending}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={bulkDeleteMut.isPending || selectedCount === 0}
              onClick={() => bulkDeleteMut.mutate([...selectedSlotIds])}
            >
              {bulkDeleteMut.isPending ? "Deleting…" : "Delete slots"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
