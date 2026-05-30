import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTablePaginationFooter } from "@/components/data-table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ListDateRangeFilter } from "@/components/list-date-range-filter";
import { type DateRangeValue, dateRangeToCreatedParams } from "@/lib/list-date-filter";
import { formatIndianDateTime } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";
import {
  ACTIVITY_MODULE_LABELS,
  activityActionLabel,
  activityEntityHref,
  activityTargetLabel,
  activityModuleLabel,
  listActivityLogs,
  type ActivityLogRow,
} from "@/lib/activity-log-api";
import { Search } from "lucide-react";

const PAGE_SIZE = 20;

function actionBadgeClass(action: string): string {
  if (action === "delete") return "bg-destructive/10 text-destructive border-destructive/20";
  if (action === "create") return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
  if (action === "update") return "bg-sky-500/10 text-sky-800 border-sky-500/20";
  if (action === "login_failed") return "bg-amber-500/10 text-amber-800 border-amber-500/20";
  return "bg-muted text-muted-foreground border-border";
}

export default function ActivityLogsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>({});

  const queryParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      search: search.trim() || undefined,
      module: moduleFilter !== "all" ? moduleFilter : undefined,
      action: actionFilter !== "all" ? actionFilter : undefined,
      ...dateRangeToCreatedParams(dateRange),
    }),
    [page, search, moduleFilter, actionFilter, dateRange.from, dateRange.to],
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["activity-logs", queryParams],
    queryFn: () => listActivityLogs(queryParams),
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? PAGE_SIZE;

  const columns = useMemo<ColumnDef<ActivityLogRow>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "When",
        meta: { cellClassName: "whitespace-nowrap" },
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">{formatIndianDateTime(row.original.createdAt)}</span>
        ),
      },
      {
        id: "user",
        header: "User",
        cell: ({ row }) => {
          const user = row.original.user;
          if (!user) return <span className="text-muted-foreground text-sm">System</span>;
          return (
            <div className="min-w-[120px]">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{user.mobile}</p>
            </div>
          );
        },
      },
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => (
          <Badge variant="outline" className={cn("font-normal capitalize", actionBadgeClass(row.original.action))}>
            {activityActionLabel(row.original.action)}
          </Badge>
        ),
      },
      {
        accessorKey: "module",
        header: "Module",
        cell: ({ row }) => <span className="text-sm">{activityModuleLabel(row.original.module)}</span>,
      },
      {
        id: "target",
        header: "Target",
        cell: ({ row }) => {
          const href = activityEntityHref(row.original);
          const label = activityTargetLabel(row.original);
          return href ? (
            <Link href={href} className="text-sm text-primary hover:underline">
              {label}
            </Link>
          ) : (
            <span className="text-sm text-muted-foreground">{label}</span>
          );
        },
      },
      {
        accessorKey: "summary",
        header: "Details",
        meta: { truncate: false },
        cell: ({ row }) => (
          <p className="text-sm max-w-[min(420px,40vw)] leading-snug">{row.original.summary}</p>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Activity logs</h2>
        <p className="text-muted-foreground">
          Audit trail of user actions — who did what, and on which record.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg border">
        <div className="flex flex-1 flex-wrap gap-4 items-end">
          <div className="space-y-1 w-full max-w-sm">
            <label className="text-xs text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="User, summary, entity id…"
                className="pl-8"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Module</label>
            <Select
              value={moduleFilter}
              onValueChange={(val) => {
                setModuleFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modules</SelectItem>
                {Object.entries(ACTIVITY_MODULE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Action</label>
            <Select
              value={actionFilter}
              onValueChange={(val) => {
                setActionFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="create">Created</SelectItem>
                <SelectItem value="update">Updated</SelectItem>
                <SelectItem value="delete">Deleted</SelectItem>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="login_failed">Login failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Date</label>
            <ListDateRangeFilter
              context="activity-logs"
              value={dateRange}
              onChange={(next) => {
                setDateRange(next);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>

      {isError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Could not load activity logs: {error instanceof Error ? error.message : "Request failed"}
        </p>
      ) : null}

      <div className="bg-card rounded-lg border shadow-sm">
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          emptyMessage="No activity logs yet."
          footer={
            <DataTablePaginationFooter
              page={page}
              total={total}
              limit={limit}
              onPageChange={setPage}
              itemLabel="logs"
            />
          }
        />
      </div>
    </div>
  );
}
