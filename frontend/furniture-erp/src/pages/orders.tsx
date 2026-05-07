import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { 
  useListOrders, 
  useDeleteOrder, 
  useUpdateOrderStatus,
  getListOrdersQueryKey
} from "@/api-client";
import { useBranch } from "@/lib/branch-context";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit, Trash2, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const ORDERS_SEARCH_PREFILL_KEY = "erp_orders_search_prefill";

export default function Orders() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [isGst, setIsGst] = useState<"all" | "true" | "false">("all");
  const [page, setPage] = useState(1);
  const [, setLocation] = useLocation();

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { selectedBranchId } = useBranch();

  useEffect(() => {
    const q = sessionStorage.getItem(ORDERS_SEARCH_PREFILL_KEY);
    if (q) {
      setSearch(q);
      sessionStorage.removeItem(ORDERS_SEARCH_PREFILL_KEY);
    }
  }, []);

  const { data: ordersData, isLoading } = useListOrders({
    search: search || undefined,
    status: status !== "all" ? (status as any) : undefined,
    isGst: isGst !== "all" ? isGst === "true" : undefined,
    branchId: selectedBranchId ?? undefined,
    page,
    limit: 10,
  });


  const deleteOrder = useDeleteOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        toast({ title: "Order deleted successfully" });
      },
    },
  });

  const updateStatus = useUpdateOrderStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        toast({ title: "Order status updated" });
      },
    },
  });

  const openCreatePage = () => setLocation("/orders/new");
  const openEditPage = (order: any) => setLocation(`/orders/${order.id}/edit`);
  const openDetailPage = (order: any) => setLocation(`/orders/${order.id}`);

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this order?")) {
      deleteOrder.mutate({ id });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "order_received": return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Order Received</Badge>;
      case "manufacturing": return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Manufacturing</Badge>;
      case "ready_to_ship": return <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">Ready To Ship</Badge>;
      case "delivered": return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Delivered</Badge>;
      case "cancelled": return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Cancelled</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const orders = ordersData?.data ?? [];

  const columns = useMemo<ColumnDef<(typeof orders)[number]>[]>(
    () => [
      {
        accessorKey: "orderNumber",
        header: "Order #",
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium">{row.original.orderNumber}</span>
        ),
      },
      {
        id: "customer",
        header: "Customer",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.customerName}</span>
            <span className="text-xs text-muted-foreground">{row.original.customerMobile}</span>
          </div>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Date",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Select
            value={row.original.status}
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
        ),
      },
      {
        accessorKey: "totalAmount",
        header: () => <span className="text-right block w-full">Total Amount (₹)</span>,
        meta: { headerClassName: "text-right", cellClassName: "text-right font-medium" },
        cell: ({ row }) => `₹${row.original.totalAmount.toLocaleString()}`,
      },
      {
        id: "balance",
        header: () => <span className="text-right block w-full">Balance (₹)</span>,
        meta: { headerClassName: "text-right", cellClassName: "text-right" },
        cell: ({ row }) => {
          const ord = row.original;
          const bal = ord.totalAmount - ord.paidAmount;
          return (
            <span className={bal > 0 ? "text-destructive" : "text-green-600"}>
              ₹{bal.toLocaleString()}
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
              <Button variant="ghost" size="icon" onClick={() => openEditPage(ord)}>
                <Edit className="h-4 w-4 text-primary" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(ord.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          );
        },
      },
    ],
    [getStatusBadge, updateStatus, openDetailPage, openEditPage, handleDelete],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Orders</h2>
          <p className="text-muted-foreground">Manage customer sales orders</p>
        </div>
        <Button onClick={openCreatePage}>
          <Plus className="mr-2 h-4 w-4" />
          Create Order
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg border">
        <div className="flex flex-1 gap-4 items-center">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={(val) => { setStatus(val); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
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
          <Select value={isGst} onValueChange={(val: any) => { setIsGst(val); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="GST Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Orders</SelectItem>
              <SelectItem value="true">GST</SelectItem>
              <SelectItem value="false">Non-GST</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <DataTable
          columns={columns}
          data={orders}
          isLoading={isLoading}
          emptyMessage="No orders found."
          footer={
            ordersData && ordersData.total > ordersData.limit ? (
              <div className="p-4 border-t flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Showing {(page - 1) * ordersData.limit + 1} to {Math.min(page * ordersData.limit, ordersData.total)} of {ordersData.total} orders
                </span>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * ordersData.limit >= ordersData.total}>
                    Next
                  </Button>
                </div>
              </div>
            ) : undefined
          }
        />
      </div>

    </div>
  );
}