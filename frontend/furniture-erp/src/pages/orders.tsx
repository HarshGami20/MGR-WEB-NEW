import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTablePaginationFooter } from "@/components/data-table";
import { 
  useListOrders, 
  useDeleteOrder, 
  useUpdateOrderStatus,
  getListOrdersQueryKey
} from "@/api-client";
import { useAuth } from "@/lib/auth";
import { assignedUserBranchIds, useBranch } from "@/lib/branch-context";
import { patchOrderDelivery } from "@/lib/delivery-api";
import { patchOrderPaymentStatus } from "@/lib/order-api";
import { isOrderLockedForEdit } from "@/lib/order-edit-lock";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit, Trash2, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ListDateRangeFilter } from "@/components/list-date-range-filter";
import { type DateRangeValue, dateRangeToCreatedParams } from "@/lib/list-date-filter";
import { ListCategoryFilter } from "@/components/list-category-filter";
import { categoryIdToParam } from "@/lib/list-category-filter";
import { getSalesOrderScopeConfig } from "@/lib/sales-order-scope";
import { DELIVERY_SLOTS_ENABLED } from "@/lib/delivery-feature";
import { usePermissions } from "@/lib/permissions";
import { OrdersExportDialog } from "@/components/orders-export-dialog";
import { formatInr } from "@/lib/format-currency";
import { formatDisplayDate } from "@/lib/format-datetime";

const ORDERS_SEARCH_PREFILL_KEY = "erp_orders_search_prefill";

export default function Orders() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [isGst, setIsGst] = useState<"all" | "true" | "false">("all");
  const [paymentStatus, setPaymentStatus] = useState<
    "all" | "due" | "partially_paid" | "paid"
  >("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [assignmentScope, setAssignmentScope] = useState<
    "all" | "created_by_me" | "assigned_to_me" | "own"
  >("all");
  const [createdDateRange, setCreatedDateRange] = useState<DateRangeValue>({});
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [singleDeleteOrderId, setSingleDeleteOrderId] = useState<number | null>(null);
  const [, setLocation] = useLocation();

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const canAddOrders = can("orders", "add");
  const canEditOrders = can("orders", "edit");
  const canDeleteOrders = can("orders", "delete");
  const canEditDeliveries = can("deliveries", "edit");
  const { selectedBranchId } = useBranch();
  const assigned = assignedUserBranchIds(user);
  const headerBranchId =
    assigned.length === 1
      ? assigned[0]!
      : assigned.length > 1
        ? selectedBranchId != null && assigned.includes(selectedBranchId)
          ? selectedBranchId
          : null
        : selectedBranchId;

  const orderScopeConfig = useMemo(() => getSalesOrderScopeConfig(user), [user]);

  useEffect(() => {
    if (orderScopeConfig.forcedScope) {
      setAssignmentScope(orderScopeConfig.forcedScope);
    }
  }, [orderScopeConfig.forcedScope]);

  useEffect(() => {
    const q = sessionStorage.getItem(ORDERS_SEARCH_PREFILL_KEY);
    if (q) {
      setSearch(q);
      sessionStorage.removeItem(ORDERS_SEARCH_PREFILL_KEY);
    }
  }, []);

  const listOrdersParams = useMemo(
    () => ({
      search: search || undefined,
      status: status !== "all" ? (status as any) : undefined,
      isGst: isGst !== "all" ? isGst === "true" : undefined,
      paymentStatus: paymentStatus !== "all" ? (paymentStatus as any) : undefined,
      sort: sort !== "newest" ? (sort as any) : undefined,
      branchId: selectedBranchId ?? undefined,
      assignmentScope: orderScopeConfig.forcedScope
        ? orderScopeConfig.forcedScope
        : orderScopeConfig.showScopePicker && assignmentScope !== "all"
          ? (assignmentScope as any)
          : undefined,
      ...dateRangeToCreatedParams(createdDateRange),
      ...categoryIdToParam(categoryId),
      page,
      limit: 10,
    }),
    [
      search,
      status,
      isGst,
      paymentStatus,
      sort,
      selectedBranchId,
      assignmentScope,
      orderScopeConfig.forcedScope,
      orderScopeConfig.showScopePicker,
      createdDateRange.from,
      createdDateRange.to,
      categoryId,
      page,
    ],
  );

  const { data: ordersData, isLoading } = useListOrders(listOrdersParams as Parameters<typeof useListOrders>[0]);


  const deleteOrder = useDeleteOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      },
    },
  });

  const updateStatus = useUpdateOrderStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        toast({ title: "Order status updated" });
      },
      onError: (error: any) =>
        toast({
          title: "Status update failed",
          description: error?.response?.data?.error ?? error?.message,
          variant: "destructive",
        }),
    },
  });

  const updatePaymentStatus = useMutation({
    mutationFn: (vars: { orderId: number; paymentStatus: "due" | "partially_paid" | "paid" }) =>
      patchOrderPaymentStatus(vars.orderId, headerBranchId, { paymentStatus: vars.paymentStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      toast({ title: "Payment status updated" });
    },
    onError: (error: Error) =>
      toast({
        title: "Payment update failed",
        description: error.message,
        variant: "destructive",
      }),
  });

  const patchDelivery = useMutation({
    mutationFn: (vars: { orderId: number; deliveryStatus: "pending" | "out_for_delivery" | "delivered" }) =>
      patchOrderDelivery(vars.orderId, headerBranchId, { deliveryStatus: vars.deliveryStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      toast({ title: "Delivery status updated" });
    },
    onError: (error: Error) =>
      toast({ title: "Delivery update failed", description: error?.message, variant: "destructive" }),
  });

  const openCreatePage = () => setLocation("/orders/new");
  const openEditPage = (order: any) => setLocation(`/orders/${order.id}/edit`);
  const openDetailPage = (order: any) => setLocation(`/orders/${order.id}`);

  const openSingleDeleteDialog = (id: number) => {
    setSingleDeleteOrderId(id);
    setDeleteInput("");
    setDeleteConfirmOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "order_received": return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Order Received</Badge>;
      case "manufacturing": return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Manufacturing</Badge>;
      case "ready_to_ship": return <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">Ready To Ship</Badge>;
      case "complete":
      case "delivered":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Delivered</Badge>;
      case "cancelled": return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Cancelled</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const getDeliveryStatusBadge = (s: string) => {
    switch (s) {
      case "pending":
        return <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">Delivery: Pending</Badge>;
      case "out_for_delivery":
        return <Badge variant="outline" className="bg-sky-50 text-sky-800 border-sky-200">Out for delivery</Badge>;
      case "delivered":
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200">Delivery: Delivered</Badge>;
      default:
        return <Badge variant="outline">{s}</Badge>;
    }
  };

  const getPaymentStatusBadge = (status: string | null | undefined) => {
    switch (status) {
      case "paid":
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200">Received</Badge>;
      case "partially_paid":
        return <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">Partial</Badge>;
      case "due":
      default:
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Due</Badge>;
    }
  };

  const orders = ordersData?.data ?? [];
  const selectedCount = selectedOrderIds.length;
  const allSelectedOnPage = orders.length > 0 && orders.every((o: any) => selectedOrderIds.includes(o.id));

  useEffect(() => {
    const validIds = new Set((ordersData?.data ?? []).map((o: any) => o.id));
    setSelectedOrderIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [ordersData]);

  const toggleSelectAllOnPage = (checked: boolean) => {
    if (checked) {
      setSelectedOrderIds((prev) => Array.from(new Set([...prev, ...orders.map((o: any) => o.id)])));
      return;
    }
    setSelectedOrderIds((prev) => prev.filter((id) => !orders.some((o: any) => o.id === id)));
  };

  const runExportSelectedOrders = () => {
    const selectedOrders = orders.filter((o: any) => selectedOrderIds.includes(o.id));
    if (selectedOrders.length === 0) return;

    const headers = [
      "Order Number",
      "Customer Name",
      "Customer Mobile",
      "Status",
      "Delivery status",
      "GST",
      "Total Amount",
      "Paid Amount",
      "Balance Amount",
      "Created At",
    ];
    const escapeCsv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = selectedOrders.map((o: any) => {
      const balance = Number(o.totalAmount || 0) - Number(o.paidAmount || 0);
      return [
        o.orderNumber,
        o.customerName,
        o.customerMobile,
        o.status,
        o.deliveryStatus ?? "pending",
        o.isGst ? "GST" : "Non-GST",
        Number(o.totalAmount || 0).toFixed(2),
        Number(o.paidAmount || 0).toFixed(2),
        balance.toFixed(2),
        new Date(o.createdAt).toISOString(),
      ].map(escapeCsv).join(",");
    });
    const csv = [headers.map(escapeCsv).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `${selectedOrders.length} order(s) exported` });
  };

  const openBulkDeleteDialog = () => {
    if (selectedOrderIds.length === 0) return;
    setSingleDeleteOrderId(null);
    setDeleteInput("");
    setDeleteConfirmOpen(true);
  };

  const runConfirmedDelete = async () => {
    if (deleteInput.trim() !== "DELETE") {
      toast({ title: "Deletion cancelled", description: 'Type exactly "DELETE" to proceed.', variant: "destructive" });
      return;
    }

    const idsToDelete = singleDeleteOrderId != null ? [singleDeleteOrderId] : selectedOrderIds;
    if (idsToDelete.length === 0) return;

    const results = await Promise.allSettled(idsToDelete.map((id) => deleteOrder.mutateAsync({ id })));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (ok > 0) {
      setSelectedOrderIds([]);
      toast({ title: singleDeleteOrderId != null ? "Order deleted successfully" : `${ok} order(s) deleted` });
    }
    if (failed.length > 0) {
      const firstErr = failed[0]?.reason as { data?: { error?: string }; message?: string } | undefined;
      const detail =
        firstErr?.data?.error ??
        (typeof firstErr?.message === "string" ? firstErr.message : undefined);
      toast({
        title: `${failed.length} deletion(s) failed`,
        description: detail,
        variant: "destructive",
      });
    }
    setDeleteConfirmOpen(false);
    setDeleteInput("");
    setSingleDeleteOrderId(null);
  };

  const columns = useMemo<ColumnDef<(typeof orders)[number]>[]>(
    () => [
      ...(canDeleteOrders
        ? [
            {
              id: "select",
              header: () => (
                <Checkbox
                  checked={allSelectedOnPage ? true : selectedCount > 0 ? "indeterminate" : false}
                  onCheckedChange={(v) => toggleSelectAllOnPage(Boolean(v))}
                  aria-label="Select all orders on this page"
                />
              ),
              meta: { headerClassName: "w-[44px]", cellClassName: "w-[44px]" },
              cell: ({ row }: { row: { original: (typeof orders)[number] } }) => {
                const id = row.original.id as number;
                const checked = selectedOrderIds.includes(id);
                return (
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      if (v) {
                        setSelectedOrderIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
                      } else {
                        setSelectedOrderIds((prev) => prev.filter((x) => x !== id));
                      }
                    }}
                    aria-label={`Select order ${row.original.orderNumber}`}
                  />
                );
              },
            } as ColumnDef<(typeof orders)[number]>,
          ]
        : []),
      {
        accessorKey: "orderNumber",
        header: "Order #",
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium text-dark hover:underline cursor-pointer" onClick={() => openDetailPage(row.original)}>{row.original.orderNumber}</span>
        ),
      },
      {
        id: "customer",
        header: "Customer",
        meta: { cellClassName: "max-w-[220px]" },
        cell: ({ row }) => (
          <div className="flex flex-col">

          <span
            className="block truncate font-medium"
            title={`${row.original.customerName}${row.original.customerMobile ? ` (${row.original.customerMobile})` : ""}`}
          >
            {row.original.customerName}
            
          </span>
          <span className="text-xs text-muted-foreground">{row.original.customerMobile ? ` ${row.original.customerMobile}` : ""}</span>
          </div>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Date",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDisplayDate(row.original.createdAt)}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) =>
          canEditOrders ? (
            <Select
              value={String(row.original.status) === "complete" ? "delivered" : String(row.original.status)}
              onValueChange={(val: any) =>
                updateStatus.mutate({ id: row.original.id, data: { status: val } })
              }
            >
              <SelectTrigger className="h-8 w-[130px] border-none bg-transparent shadow-none p-0 focus:ring-0">
                {getStatusBadge(row.original.status)}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="order_received">Order Received</SelectItem>
                <SelectItem value="manufacturing">Manufacturing</SelectItem>
                <SelectItem value="ready_to_ship">Ready To Ship</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            getStatusBadge(row.original.status)
          ),
      },
      {
        id: "deliveryStatus",
        header: "Delivery",
        meta: { headerClassName: "whitespace-nowrap", cellClassName: "whitespace-nowrap " },
        cell: ({ row }) => {
          const ord = row.original as {
            id: number;
            status: string;
            deliveryStatus?: string;
            deliveryDate?: string | null;
            deliveryAssignees?: Array<{ id: number }>;
            deliverySlot?: {
              label: string;
              startTime: string;
              endTime: string;
              slotDate?: string;
            } | null;
          };
          const del = String(ord.deliveryStatus ?? "pending");
          const rowPending = patchDelivery.isPending && patchDelivery.variables?.orderId === ord.id;
          const canEditDelivery = canEditOrders || canEditDeliveries;
          const dateSource = ord.deliveryDate ?? ord.deliverySlot?.slotDate ?? null;
          const dateStr =
            dateSource != null && String(dateSource).trim() !== ""
              ? new Date(dateSource as string).toLocaleDateString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : null;
          const slot = DELIVERY_SLOTS_ENABLED ? ord.deliverySlot : null;
          const slotStr = slot ? `${slot.label} (${slot.startTime}–${slot.endTime})` : null;
          if (!canEditDelivery) {
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">{getDeliveryStatusBadge(del)}</span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] space-y-1.5 py-2 text-left font-normal leading-snug">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide opacity-80">Delivery date</div>
                    <div className="text-sm">{dateStr ?? "—"}</div>
                  </div>
                  {DELIVERY_SLOTS_ENABLED ? (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide opacity-80">Slot</div>
                      <div className="text-sm break-words">{slotStr ?? "—"}</div>
                    </div>
                  ) : null}
                </TooltipContent>
              </Tooltip>
            );
          }
          return (
            <Select
              value={del}
              disabled={rowPending}
              onValueChange={(val) =>
                patchDelivery.mutate({
                  orderId: ord.id,
                  deliveryStatus: val as "pending" | "out_for_delivery" | "delivered",
                })
              }
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <SelectTrigger className="h-8 min-w-[152px] max-w-[152px] border-none bg-transparent shadow-none p-0 focus:ring-0">
                    {getDeliveryStatusBadge(del)}
                  </SelectTrigger>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] space-y-1.5 py-2 text-left font-normal leading-snug">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide opacity-80">Delivery date</div>
                    <div className="text-sm">{dateStr ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide opacity-80">Slot</div>
                    <div className="text-sm break-words">{slotStr ?? "—"}</div>
                  </div>
                </TooltipContent>
              </Tooltip>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="out_for_delivery">Out for delivery</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
          );
        },
      },
      {
        id: "paymentStatus",
        header: "Payment",
        meta: { headerClassName: "whitespace-nowrap", cellClassName: "whitespace-nowrap" },
        cell: ({ row }) => {
          const ord = row.original as { id: number; paymentStatus?: string | null };
          const pay = String(ord.paymentStatus ?? "due");
          const rowPending =
            updatePaymentStatus.isPending && updatePaymentStatus.variables?.orderId === ord.id;
          if (!canEditOrders) {
            return getPaymentStatusBadge(pay);
          }
          return (
            <Select
              value={pay}
              disabled={rowPending}
              onValueChange={(val: "due" | "partially_paid" | "paid") =>
                updatePaymentStatus.mutate({
                  orderId: ord.id,
                  paymentStatus: val,
                })
              }
            >
              <SelectTrigger className="h-8 min-w-[100px] max-w-[100px] border-none bg-transparent shadow-none p-0 focus:ring-0">
                {getPaymentStatusBadge(pay)}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="due">Due</SelectItem>
                <SelectItem value="partially_paid">Partial</SelectItem>
                <SelectItem value="paid">Received</SelectItem>
              </SelectContent>
            </Select>
          );
        },
      },
      {
        accessorKey: "totalAmount",
        header: () => <span className=" w-full whitespace-nowrap text-right"> <span className="xl:inline hidden">Total </span>Amount (₹)</span>,
        meta: {
          headerClassName: "text-right whitespace-nowrap",
          cellClassName: "text-right font-medium whitespace-nowrap tabular-nums",
        },
        cell: ({ row }) => formatInr(row.original.totalAmount),
      },
      {
        id: "balance",
        header: () => <span className=" w-full whitespace-nowrap text-right">Due Amount (₹)</span>,
        meta: {
          headerClassName: "text-right whitespace-nowrap",
          cellClassName: "text-right whitespace-nowrap tabular-nums",
        },
        cell: ({ row }) => {
          const ord = row.original;
          const bal = ord.totalAmount - ord.paidAmount;
          return (
            <span className={bal > 0 ? "text-destructive" : "text-green-600"}>
              {formatInr(bal)}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { headerClassName: "w-[110px]", cellClassName: "text-right" },
        cell: ({ row }) => {
          const ord = row.original;
          return (
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="icon" onClick={() => openDetailPage(ord)}>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </Button>
              {canEditOrders &&
              !isOrderLockedForEdit({
                status: ord.status,
                deliveryStatus: (ord as { deliveryStatus?: string }).deliveryStatus,
              }) ? (
                <Button variant="ghost" size="icon" onClick={() => openEditPage(ord)}>
                  <Edit className="h-4 w-4 text-primary" />
                </Button>
              ) : null}
              {canDeleteOrders ? (
                <Button variant="ghost" size="icon" onClick={() => openSingleDeleteDialog(ord.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [
      allSelectedOnPage,
      getDeliveryStatusBadge,
      getPaymentStatusBadge,
      getStatusBadge,
      openDetailPage,
      openEditPage,
      patchDelivery.isPending,
      patchDelivery.variables?.orderId,
      patchDelivery.mutate,
      selectedCount,
      selectedOrderIds,
      updateStatus,
      updatePaymentStatus.isPending,
      updatePaymentStatus.variables?.orderId,
      updatePaymentStatus.mutate,
      user,
      canDeleteOrders,
      canEditOrders,
      canEditDeliveries,
    ],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Orders</h2>
          <p className="text-muted-foreground">Manage customer sales orders</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can("orders", "view") ? (
            <OrdersExportDialog categoryId={categoryId} />
          ) : null}
          {canAddOrders ? (
            <Button onClick={openCreatePage}>
              <Plus className="mr-2 h-4 w-4" />
              Create Order
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-4 bg-card p-4 rounded-lg border">
        <div className="flex flex-1 flex-wrap gap-4 items-end">
          <div className="space-y-1 w-full max-w-sm">
            <label className="text-xs text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Date</label>
            <ListDateRangeFilter
              context="orders"
              value={createdDateRange}
              onChange={(next) => {
                setCreatedDateRange(next);
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
            <label className="text-xs text-muted-foreground">Order Status</label>
            <Select value={status} onValueChange={(val) => { setStatus(val); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="order_received">Order Received</SelectItem>
                <SelectItem value="manufacturing">Manufacturing</SelectItem>
                <SelectItem value="ready_to_ship">Ready To Ship</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">GST</label>
            <Select value={isGst} onValueChange={(val: any) => { setIsGst(val); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All orders" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Orders</SelectItem>
                <SelectItem value="true">GST</SelectItem>
                <SelectItem value="false">Non-GST</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Payment</label>
            <Select
              value={paymentStatus}
              onValueChange={(val: "all" | "due" | "partially_paid" | "paid") => {
                setPaymentStatus(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All payments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payments</SelectItem>
                <SelectItem value="due">Due</SelectItem>
                <SelectItem value="partially_paid">Partial</SelectItem>
                <SelectItem value="paid">Received</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Sort</label>
            <Select
              value={sort}
              onValueChange={(val: "newest" | "oldest") => {
                setSort(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Newest first" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {orderScopeConfig.showScopePicker ? (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Scope</label>
              <Select
                value={assignmentScope}
                onValueChange={(val: "all" | "created_by_me" | "assigned_to_me") => {
                  setAssignmentScope(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All orders" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All orders</SelectItem>
                  <SelectItem value="created_by_me">Created by me</SelectItem>
                  <SelectItem value="assigned_to_me">Assigned to me</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : orderScopeConfig.forcedScope ? (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Scope</label>
              <div className="flex h-9 items-center rounded-xl border border-border/80 bg-muted/30 px-3 text-sm text-muted-foreground">
                {orderScopeConfig.scopeLabel}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {selectedCount > 0 ? (
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5">
          <span className="text-sm text-muted-foreground">{selectedCount} order(s) selected</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setExportConfirmOpen(true)}>Export selected</Button>
            {canDeleteOrders ? (
              <Button variant="destructive" size="sm" onClick={openBulkDeleteDialog}>
                Delete selected
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="bg-card rounded-lg border shadow-sm">
        <DataTable
          columns={columns}
          data={orders}
          isLoading={isLoading}
          emptyMessage="No orders found."
          footer={<DataTablePaginationFooter page={page} total={ordersData?.total ?? 0} limit={ordersData?.limit ?? 10} onPageChange={setPage} itemLabel="orders" />}
        />
      </div>

      <AlertDialog open={exportConfirmOpen} onOpenChange={setExportConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Export selected orders?</AlertDialogTitle>
            <AlertDialogDescription>
              This will download a CSV file for {selectedCount} selected order(s).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                runExportSelectedOrders();
                setExportConfirmOpen(false);
              }}
            >
              Export
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) {
            setDeleteInput("");
            setSingleDeleteOrderId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm deletion</DialogTitle>
            <DialogDescription>
              {singleDeleteOrderId != null
                ? `To delete this order, type "DELETE" below.`
                : `To delete ${selectedCount} selected order(s), type "DELETE" below.`}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteInput}
            onChange={(e) => setDeleteInput(e.target.value)}
            placeholder='Type "DELETE"'
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setDeleteInput("");
                setSingleDeleteOrderId(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={runConfirmedDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}