import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import type { ColumnDef } from "@tanstack/react-table";
import {
  useListPurchaseOrders,
  useUpdatePurchaseOrderStatus,
  getListPurchaseOrdersQueryKey,
  type UpdatePurchaseOrderStatusBodyStatus,
} from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { isPartnerPortalUser, partnerPortalLabel } from "@/lib/partner";
import { isOpenPurchaseOrderStatus, poStatusLabel } from "@/lib/partner-po-attributes";
import { poStatusChip } from "@/lib/partner-po-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, DataTablePaginationFooter } from "@/components/data-table";
import { ListCategoryFilter } from "@/components/list-category-filter";
import { categoryIdToParam } from "@/lib/list-category-filter";
import { ListDateRangeFilter } from "@/components/list-date-range-filter";
import { type DateRangeValue, dateRangeToCreatedParams } from "@/lib/list-date-filter";
import { formatInr } from "@/lib/format-currency";
import { formatDisplayDate } from "@/lib/format-datetime";
import { ArrowLeft, Eye, Factory, Search, Truck } from "lucide-react";

const PARTNER_STATUS_OPTIONS = ["confirmed", "in_production", "shipped", "delivered"] as const;

const PO_LIST_STATUS_FILTERS = [
  "all",
  "open",
  "pending",
  "confirmed",
  "in_production",
  "shipped",
  "delivered",
] as const;

type PoListStatusFilter = (typeof PO_LIST_STATUS_FILTERS)[number];

function statusFilterFromSearch(search: string): PoListStatusFilter {
  const status = new URLSearchParams(search).get("status")?.trim();
  if (status && (PO_LIST_STATUS_FILTERS as readonly string[]).includes(status)) {
    return status as PoListStatusFilter;
  }
  return "all";
}

type PoRow = {
  id: number;
  poNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  expectedDelivery?: string | null;
  branch?: { name?: string } | null;
  items?: unknown[];
};

export default function PartnerPurchaseOrdersListPage() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PoListStatusFilter>(() =>
    statusFilterFromSearch(typeof window !== "undefined" ? window.location.search : ""),
  );
  const [dateRange, setDateRange] = useState<DateRangeValue>({});
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    setStatusFilter(statusFilterFromSearch(window.location.search));
    setPage(1);
  }, [location]);

  const listParams = useMemo(() => {
    const category = categoryIdToParam(categoryId);
    const dates = dateRangeToCreatedParams(dateRange);
    const base = {
      page,
      limit: 20,
      ...category,
      ...dates,
      ...(search.trim() ? { search: search.trim() } : {}),
    };
    if (statusFilter === "open") return { openOnly: "true" as const, ...base };
    if (statusFilter === "all") return base;
    return { status: statusFilter as UpdatePurchaseOrderStatusBodyStatus, ...base };
  }, [statusFilter, page, categoryId, dateRange, search]);

  const { data, isLoading } = useListPurchaseOrders(
    listParams as Parameters<typeof useListPurchaseOrders>[0],
  );

  const updateStatus = useUpdatePurchaseOrderStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        toast({ title: "Status updated" });
      },
      onError: (e: { data?: { error?: string }; message?: string }) =>
        toast({
          title: "Could not update",
          description: e?.data?.error ?? e?.message ?? "Try again.",
          variant: "destructive",
        }),
    },
  });

  const rows = (data?.data ?? []) as PoRow[];

  const columns = useMemo<ColumnDef<PoRow>[]>(
    () => [
      {
        accessorKey: "poNumber",
        header: "PO number",
        cell: ({ row }) => (
          <Link
            href={`/purchase-orders/${row.original.id}`}
            className="font-mono text-sm font-medium  hover:underline"
          >
            {row.original.poNumber}
          </Link>
        ),
      },
      {
        id: "branch",
        header: "Branch",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.branch?.name ?? "—"}</span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-muted-foreground whitespace-nowrap">
            {formatDisplayDate(row.original.createdAt)}
          </span>
        ),
      },
      {
        accessorKey: "expectedDelivery",
        header: "Expected delivery",
        cell: ({ row }) =>
          row.original.expectedDelivery ? (
            <span className="text-muted-foreground whitespace-nowrap">
              {formatDisplayDate(row.original.expectedDelivery)}
            </span>
          ) : (
            "—"
          ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const po = row.original;
          const st = String(po.status);
          const canQuickEdit = !["cancelled", "delivered"].includes(st);
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              {canQuickEdit ? (
                <Select
                  value={st}
                  onValueChange={(val) =>
                    updateStatus.mutate({
                      id: po.id,
                      data: { status: val as UpdatePurchaseOrderStatusBodyStatus },
                    })
                  }
                >
                  <SelectTrigger className="h-8 w-[min(100%,168px)] border-none bg-transparent shadow-none p-0 focus:ring-0">
                    {poStatusChip(st)}
                  </SelectTrigger>
                  <SelectContent>
                    {[st, ...PARTNER_STATUS_OPTIONS]
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .map((s) => (
                        <SelectItem key={s} value={s}>
                          {poStatusLabel(s)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : (
                poStatusChip(st)
              )}
              {isOpenPurchaseOrderStatus(st) ? (
                <span className="text-[10px] font-medium text-amber-700">Open</span>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "totalAmount",
        header: () => <span className="text-right block w-full">Amount</span>,
        meta: { headerClassName: "text-right", cellClassName: "text-right font-medium tabular-nums" },
        cell: ({ row }) => formatInr(Number(row.original.totalAmount ?? 0)),
      },
      {
        id: "lines",
        header: "Lines",
        cell: ({ row }) => {
          const n = row.original.items?.length;
          return n != null ? (
            <span className="text-muted-foreground tabular-nums">{n}</span>
          ) : (
            "—"
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { headerClassName: "w-[88px]", cellClassName: "text-right" },
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label={`Open ${row.original.poNumber}`}
            onClick={() => setLocation(`/purchase-orders/${row.original.id}`)}
          >
            <Eye className="h-4 w-4 text-muted-foreground" />
          </Button>
        ),
      },
    ],
    [setLocation, updateStatus],
  );

  if (!user || !isPartnerPortalUser(user)) return null;

  const isSupplier = !!user.supplierId;
  const PanelIcon = isSupplier ? Truck : Factory;
  const orgLabel = partnerPortalLabel(user);

  const hasActiveFilters =
    search.trim() !== "" ||
    statusFilter !== "all" ||
    categoryId != null ||
    Boolean(dateRange.from?.trim()) ||
    Boolean(dateRange.to?.trim());

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-[1600px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-start gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mb-1 -ml-2 max-h-8 rounded-full gap-1.5 text-muted-foreground"
            asChild
          >
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
          <div className="">
          <h2 className="text-2xl font-bold tracking-tight">Purchase orders</h2>
          <p className="text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
            <PanelIcon className="h-4 w-4 shrink-0" aria-hidden />
            {orgLabel}
          </p>
          </div>
        </div>
       
      </div>

      <div className="flex flex-col gap-4 bg-card p-4 rounded-lg border">
        <div className="flex flex-1 flex-wrap gap-4 items-end">
          <div className="space-y-1 w-full max-w-sm">
            <label className="text-xs text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by PO number…"
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
            <label className="text-xs text-muted-foreground">Date</label>
            <ListDateRangeFilter
              context="purchaseOrders"
              value={dateRange}
              onChange={(next) => {
                setDateRange(next);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Category</label>
            <ListCategoryFilter
              value={categoryId}
              onChange={(next) => {
                setCategoryId(next);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as PoListStatusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open orders</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="in_production">In production</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters ? (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground invisible select-none">Clear</label>
              <Button
                type="button"
                variant="outline"
                className="h-9"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setDateRange({});
                  setCategoryId(undefined);
                  setPage(1);
                  if (window.location.search) setLocation("/purchase-orders");
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          emptyMessage="No purchase orders match this filter."
          footer={
            <DataTablePaginationFooter
              page={page}
              total={data?.total ?? 0}
              limit={data?.limit ?? 20}
              onPageChange={setPage}
              itemLabel="orders"
            />
          }
        />
      </div>
    </div>
  );
}
