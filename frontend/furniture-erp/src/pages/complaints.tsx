import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTablePaginationFooter } from "@/components/data-table";
import { useListOrders, useListPurchaseOrders } from "@/api-client";
import { useBranch, assignedUserBranchIds } from "@/lib/branch-context";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { isPartnerPortalUser } from "@/lib/partner";
import {
  listComplaints,
  createComplaint,
  deleteComplaint,
  updateComplaintStatus,
  uploadComplaintImage,
  listComplaintAssignableUsers,
  type Complaint,
  type ComplaintKind,
  type ComplaintStatus,
} from "@/lib/complaint-api";
import { formatUploadErrorMessage, validateImageFile } from "@/lib/upload-error-message";
import { canUpdateComplaintStatus } from "@/lib/complaint-status-access";
import { AssigneesMultiSelect } from "@/components/assignees-multi-select";
import { SearchableSelect } from "@/components/searchable-select";
import { AddressOrLink } from "@/components/address-or-link";
import { isExternalLinkText } from "@/lib/address-or-link";
import { resolvedProductImageUrl } from "@/lib/product-image-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Eye, Trash2, Upload, ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ListDateRangeFilter } from "@/components/list-date-range-filter";
import { type DateRangeValue, dateRangeToCreatedParams } from "@/lib/list-date-filter";
import { ListCategoryFilter } from "@/components/list-category-filter";

type ComplaintProductPickOption = { productId: number; label: string };

/** One select entry per product — duplicate lines on the same order/PO share productId and break Radix Select. */
function buildUniqueProductPickOptions(
  items: Array<{
    productId: number | null;
    quantity?: number;
    isCustom?: boolean;
    product?: { name?: string | null; sku?: string | null } | null;
  }>,
): ComplaintProductPickOption[] {
  const byId = new Map<number, { label: string; qty: number }>();
  for (const item of items) {
    if (item.productId == null || item.isCustom) continue;
    const id = item.productId;
    const name = item.product?.name?.trim() || `Product #${id}`;
    const sku = item.product?.sku?.trim();
    const base = sku ? `${name} · ${sku}` : name;
    const lineQty = item.quantity ?? 1;
    const existing = byId.get(id);
    if (existing) {
      existing.qty += lineQty;
    } else {
      byId.set(id, { label: base, qty: lineQty });
    }
  }
  return Array.from(byId.entries()).map(([productId, row]) => ({
    productId,
    label: row.qty > 1 ? `${row.label} (×${row.qty})` : row.label,
  }));
}

function getComplaintStatusBadge(status: ComplaintStatus) {
  switch (status) {
    case "open":
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Open</Badge>;
    case "in_progress":
      return <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">In Progress</Badge>;
    case "resolved":
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Resolved</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

export default function ComplaintsPage() {
  const [, setLocation] = useLocation();
  const { can } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const partnerUser = isPartnerPortalUser(user);
  const { selectedBranchId } = useBranch();
  const assigned = assignedUserBranchIds(user);

  const branchId = partnerUser ? undefined : (selectedBranchId ?? undefined);
  const writeBranchId =
    assigned.length === 1
      ? assigned[0]!
      : assigned.length > 1
        ? selectedBranchId != null && assigned.includes(selectedBranchId)
          ? selectedBranchId
          : null
        : selectedBranchId;

  const [activeTab, setActiveTab] = useState<ComplaintKind>(
    partnerUser ? "purchase_order" : "sales_order",
  );
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeValue>({});
  const [status, setStatus] = useState<string>("all");
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [singleDeleteId, setSingleDeleteId] = useState<number | null>(null);
  const [complaintDialogEl, setComplaintDialogEl] = useState<HTMLDivElement | null>(null);

  const [formOrderId, setFormOrderId] = useState("");
  const [formPoId, setFormPoId] = useState("");
  const [formCustomerName, setFormCustomerName] = useState("");
  const [formCustomerMobile, setFormCustomerMobile] = useState("");
  const [formCustomerAddress, setFormCustomerAddress] = useState("");
  const [formProductId, setFormProductId] = useState("none");
  const [formSubject, setFormSubject] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formImages, setFormImages] = useState<string[]>([]);
  const [formAssigneeIds, setFormAssigneeIds] = useState<number[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const kind = params.get("kind");
    const poId = params.get("purchaseOrderId");
    const create = params.get("create");
    if (kind === "purchase_order" || partnerUser) {
      setActiveTab("purchase_order");
    } else if (kind === "sales_order") {
      setActiveTab("sales_order");
    }
    if (poId) {
      setFormPoId(poId);
      setActiveTab("purchase_order");
    }
    if (create === "1" || create === "true") {
      setDialogOpen(true);
    }
    if (poId || create) {
      window.history.replaceState({}, "", "/complaints");
    }
  }, [partnerUser]);

  const listKind = partnerUser ? "purchase_order" : activeTab;

  const { data: complaintsData, isLoading } = useQuery({
    queryKey: ["complaints", listKind, search, status, branchId, categoryId, dateRange.from, dateRange.to, page],
    queryFn: () =>
      listComplaints({
        kind: listKind,
        search: search || undefined,
        status: status !== "all" ? (status as ComplaintStatus) : undefined,
        branchId,
        categoryId,
        ...dateRangeToCreatedParams(dateRange),
        page,
        limit: 10,
      }),
  });

  const { data: ordersData } = useListOrders(
    { branchId, limit: 200, page: 1 },
    { query: { enabled: !partnerUser && activeTab === "sales_order" && dialogOpen } },
  );

  const { data: poData } = useListPurchaseOrders(
    { limit: 200, page: 1 },
    { query: { enabled: activeTab === "purchase_order" && dialogOpen } },
  );

  const { data: assignableUsersData } = useQuery({
    queryKey: ["complaint-assignable-users", writeBranchId],
    queryFn: () => listComplaintAssignableUsers(writeBranchId!),
    enabled: dialogOpen && writeBranchId != null && !partnerUser && can("complaints", "add"),
  });
  const assignableUsers = assignableUsersData?.data ?? [];

  const complaints = complaintsData?.data ?? [];

  const selectedOrder = useMemo(() => {
    const id = parseInt(formOrderId, 10);
    if (!Number.isFinite(id)) return null;
    return ordersData?.data?.find((o) => o.id === id) ?? null;
  }, [formOrderId, ordersData]);

  const selectedPo = useMemo(() => {
    const id = parseInt(formPoId, 10);
    if (!Number.isFinite(id)) return null;
    return poData?.data?.find((p) => p.id === id) ?? null;
  }, [formPoId, poData]);

  const statusMut = useMutation({
    mutationFn: ({ id, status: next }: { id: number; status: ComplaintStatus }) =>
      updateComplaintStatus(id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      toast({ title: "Complaint status updated" });
    },
    onError: (e: Error) =>
      toast({ title: "Status update failed", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteComplaint(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      toast({ title: "Complaint deleted" });
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const createMut = useMutation({
    mutationFn: () => {
      const isPo = partnerUser || activeTab === "purchase_order";
      if (isPo) {
        const poIdNum = parseInt(formPoId, 10);
        return createComplaint({
          kind: "purchase_order",
          ...(Number.isFinite(poIdNum) && poIdNum > 0 ? { purchaseOrderId: poIdNum } : {}),
          productId: formProductId !== "none" ? parseInt(formProductId, 10) : null,
          subject: formSubject.trim() || null,
          description: formDescription.trim(),
          imageUrls: formImages.length > 0 ? formImages : undefined,
          assigneeUserIds: formAssigneeIds.length > 0 ? formAssigneeIds : undefined,
        });
      }
      const orderIdNum = parseInt(formOrderId, 10);
      const hasLinkedOrder = Number.isFinite(orderIdNum) && orderIdNum > 0;
      return createComplaint({
        kind: "sales_order",
        ...(hasLinkedOrder ? { orderId: orderIdNum } : {}),
        ...(!hasLinkedOrder
          ? {
              customerName: formCustomerName.trim(),
              customerMobile: formCustomerMobile.trim() || null,
              customerAddress: formCustomerAddress.trim() || null,
            }
          : {}),
        productId: formProductId !== "none" ? parseInt(formProductId, 10) : null,
        subject: formSubject.trim() || null,
        description: formDescription.trim(),
        imageUrls: formImages.length > 0 ? formImages : undefined,
        assigneeUserIds: formAssigneeIds.length > 0 ? formAssigneeIds : undefined,
      });
    },
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      toast({ title: "Complaint registered" });
      setDialogOpen(false);
      resetForm();
      setLocation(`/complaints/${c.id}`);
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormOrderId("");
    setFormPoId("");
    setFormCustomerName("");
    setFormCustomerMobile("");
    setFormCustomerAddress("");
    setFormProductId("none");
    setFormSubject("");
    setFormDescription("");
    setFormImages([]);
    setFormAssigneeIds([]);
  };

  const openDetailPage = (c: Complaint) => setLocation(`/complaints/${c.id}`);

  const openSingleDeleteDialog = (id: number) => {
    setSingleDeleteId(id);
    setDeleteInput("");
    setDeleteConfirmOpen(true);
  };

  const runConfirmedDelete = async () => {
    if (deleteInput.trim() !== "DELETE") {
      toast({ title: "Deletion cancelled", description: 'Type exactly "DELETE" to proceed.', variant: "destructive" });
      return;
    }
    if (singleDeleteId == null) return;
    try {
      await deleteMut.mutateAsync(singleDeleteId);
    } finally {
      setDeleteConfirmOpen(false);
      setDeleteInput("");
      setSingleDeleteId(null);
    }
  };

  const handleDialogImageUpload = async (file: File | undefined) => {
    if (!file) return;
    const validationError = validateImageFile(file, 5);
    if (validationError) {
      toast({ title: validationError, variant: "destructive" });
      return;
    }
    try {
      setUploading(true);
      const { imageUrl } = await uploadComplaintImage(file, writeBranchId);
      setFormImages((prev) => [...prev, imageUrl]);
      toast({ title: "Image uploaded" });
    } catch (err: unknown) {
      toast({
        title: "Upload failed",
        description: formatUploadErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const isPoTab = partnerUser || activeTab === "purchase_order";
  const createDisabled =
    !formDescription.trim() || (!isPoTab && !formOrderId && !formCustomerName.trim());

  const salesColumns = useMemo<ColumnDef<Complaint>[]>(
    () => [
      {
        accessorKey: "complaintNumber",
        header: "Complaint #",
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium">{row.original.complaintNumber}</span>
        ),
      },
      {
        id: "order",
        header: "Order #",
        cell: ({ row }) => (
          <span className="font-mono text-sm text-muted-foreground">
            {row.original.order?.orderNumber ?? "—"}
          </span>
        ),
      },
      {
        id: "customer",
        header: "Customer",
        meta: { cellClassName: "max-w-[220px]" },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="block truncate font-medium" title={row.original.customerName ?? undefined}>
              {row.original.customerName ?? "—"}
            </span>
            <span className="text-xs text-muted-foreground">{row.original.customerMobile ?? ""}</span>
          </div>
        ),
      },
      {
        id: "product",
        header: "Product",
        meta: { cellClassName: "max-w-[160px]" },
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground line-clamp-2" title={row.original.product?.name ?? "All items"}>
            {row.original.product?.name ?? "All items"}
          </span>
        ),
      },
      {
        id: "subject",
        header: "Subject",
        meta: { cellClassName: "max-w-[180px]" },
        cell: ({ row }) => (
          <span className="text-sm line-clamp-2" title={row.original.subject ?? row.original.description}>
            {row.original.subject || row.original.description.slice(0, 60)}
          </span>
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
        cell: ({ row }) =>
          can("complaints", "edit") && canUpdateComplaintStatus(user, row.original) ? (
            <Select
              value={row.original.status}
              onValueChange={(val) =>
                statusMut.mutate({ id: row.original.id, status: val as ComplaintStatus })
              }
            >
              <SelectTrigger className="h-8 w-[130px] border-none bg-transparent shadow-none p-0 focus:ring-0">
                {getComplaintStatusBadge(row.original.status)}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            getComplaintStatusBadge(row.original.status)
          ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { headerClassName: "w-[90px]", cellClassName: "text-right" },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="icon" onClick={() => openDetailPage(row.original)}>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </Button>
            {can("complaints", "delete") && (
              <Button variant="ghost" size="icon" onClick={() => openSingleDeleteDialog(row.original.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [can, statusMut, user],
  );

  const poColumns = useMemo<ColumnDef<Complaint>[]>(
    () => [
      {
        accessorKey: "complaintNumber",
        header: "Complaint #",
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium">{row.original.complaintNumber}</span>
        ),
      },
      {
        id: "po",
        header: "PO #",
        cell: ({ row }) => (
          <div className="font-mono text-sm text-muted-foreground hover:underline cursor-pointer" onClick={() => openDetailPage(row.original)}>
            {row.original.purchaseOrder?.poNumber ?? "—"}
          </div>
        ),
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="secondary" className="capitalize font-normal">
            {row.original.purchaseOrder?.type ?? "—"}
          </Badge>
        ),
      },
      {
        id: "product",
        header: "Product",
        meta: { cellClassName: "max-w-[160px]" },
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground line-clamp-2" title={row.original.product?.name ?? "All items"}>
            {row.original.product?.name ?? "All items"}
          </span>
        ),
      },
      {
        id: "subject",
        header: "Subject",
        meta: { cellClassName: "max-w-[180px]" },
        cell: ({ row }) => (
          <span className="text-sm line-clamp-2" title={row.original.subject ?? row.original.description}>
            {row.original.subject || row.original.description.slice(0, 60)}
          </span>
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
        cell: ({ row }) =>
          can("complaints", "edit") && canUpdateComplaintStatus(user, row.original) ? (
            <Select
              value={row.original.status}
              onValueChange={(val) =>
                statusMut.mutate({ id: row.original.id, status: val as ComplaintStatus })
              }
            >
              <SelectTrigger className="h-8 w-[130px] border-none bg-transparent shadow-none p-0 focus:ring-0">
                {getComplaintStatusBadge(row.original.status)}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            getComplaintStatusBadge(row.original.status)
          ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { headerClassName: "w-[90px]", cellClassName: "text-right" },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="icon" onClick={() => openDetailPage(row.original)}>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </Button>
            {!partnerUser && can("complaints", "delete") && (
              <Button variant="ghost" size="icon" onClick={() => openSingleDeleteDialog(row.original.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [can, partnerUser, statusMut, user],
  );

  const columns = isPoTab ? poColumns : salesColumns;

  const poProductOptions = useMemo(
    () => buildUniqueProductPickOptions(selectedPo?.items ?? []),
    [selectedPo],
  );

  const orderProductOptions = useMemo(
    () => buildUniqueProductPickOptions(selectedOrder?.items ?? []),
    [selectedOrder],
  );

  const orderSelectOptions = useMemo(
    () => [
      { value: "none", label: "No linked order" },
      ...(ordersData?.data ?? []).map((o) => ({
        value: String(o.id),
        label: `${o.orderNumber} — ${o.customerName}`,
        keywords: [o.orderNumber, o.customerName, o.customerMobile ?? ""].filter(Boolean),
      })),
    ],
    [ordersData],
  );

  const poSelectOptions = useMemo(
    () => [
      { value: "none", label: "No linked purchase order" },
      ...(poData?.data ?? []).map((po) => ({
        value: String(po.id),
        label: `${po.poNumber} — ${po.status.replace(/_/g, " ")}`,
        keywords: [po.poNumber, po.status, po.type].filter(Boolean),
      })),
    ],
    [poData],
  );

  const poProductSelectOptions = useMemo(
    () => [
      { value: "none", label: "All / general issue" },
      ...poProductOptions.map((opt) => ({
        value: String(opt.productId),
        label: opt.label,
      })),
    ],
    [poProductOptions],
  );

  const orderProductSelectOptions = useMemo(
    () => [
      { value: "none", label: "All / general issue" },
      ...orderProductOptions.map((opt) => ({
        value: String(opt.productId),
        label: opt.label,
      })),
    ],
    [orderProductOptions],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Complaints</h2>
          <p className="text-muted-foreground">
            {partnerUser
              ? "View and track issues on your purchase orders"
              : "Manage complaints for sales orders and purchase orders"}
          </p>
        </div>
        {can("complaints", "add") && !partnerUser && (
          <Button
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New complaint
          </Button>
        )}
      </div>

      {!partnerUser && (
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as ComplaintKind);
            setPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="sales_order">Sales orders</TabsTrigger>
            <TabsTrigger value="purchase_order">Purchase orders</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg border">
        <div className="flex flex-1 gap-4 items-center flex-wrap">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search complaints..."
              className="pl-8"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <ListDateRangeFilter
            context="complaints"
            value={dateRange}
            onChange={(next) => {
              setDateRange(next);
              setPage(1);
            }}
          />
          <ListCategoryFilter
            value={categoryId}
            onChange={(next) => {
              setCategoryId(next);
              setPage(1);
            }}
          />
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <DataTable
          columns={columns}
          data={complaints}
          isLoading={isLoading}
          emptyMessage={isPoTab ? "No purchase order complaints found." : "No sales order complaints found."}
          footer={
            <DataTablePaginationFooter
              page={page}
              total={complaintsData?.total ?? 0}
              limit={complaintsData?.limit ?? 10}
              onPageChange={setPage}
              itemLabel="complaints"
            />
          }
        />
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          ref={setComplaintDialogEl}
          className="max-w-lg max-h-[90vh] flex flex-col gap-4 overflow-visible"
        >
          <DialogHeader className="shrink-0">
            <DialogTitle>Register complaint</DialogTitle>
            {/* <DialogDescription>
              {isPoTab
                ? "Link a purchase order, describe the issue, and attach photos if needed."
                : "Link a sales order, describe the issue, and attach photos if needed."}
            </DialogDescription> */}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain -mx-1 px-1">
          <div className="space-y-4 py-2">
            {isPoTab ? (
              <>
                <div className="space-y-2">
                  <Label>Linked purchase order (optional)</Label>
                  <SearchableSelect
                    value={formPoId || "none"}
                    onValueChange={(v) => {
                      setFormPoId(v === "none" ? "" : v);
                      setFormProductId("none");
                    }}
                    options={poSelectOptions}
                    placeholder="No linked purchase order"
                    searchPlaceholder="Search by PO number or status…"
                    emptyMessage="No purchase order found."
                    portalContainer={complaintDialogEl}
                  />
                </div>
                {selectedPo && (
                  <div className="rounded-md border bg-muted/40 p-3 text-sm">
                    <p className="font-medium">PO summary</p>
                    <p className="text-muted-foreground capitalize">Type: {selectedPo.type}</p>
                    <p className="text-muted-foreground">Status: {selectedPo.status.replace(/_/g, " ")}</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Product (optional)</Label>
                  <SearchableSelect
                    value={formProductId}
                    onValueChange={setFormProductId}
                    options={poProductSelectOptions}
                    placeholder="All products on PO"
                    searchPlaceholder="Search product…"
                    emptyMessage="No product found."
                    disabled={!formPoId}
                    portalContainer={complaintDialogEl}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Linked order (optional)</Label>
                  <SearchableSelect
                    value={formOrderId || "none"}
                    onValueChange={(v) => {
                      setFormOrderId(v === "none" ? "" : v);
                      setFormProductId("none");
                      if (v !== "none") {
                        setFormCustomerName("");
                        setFormCustomerMobile("");
                        setFormCustomerAddress("");
                      }
                    }}
                    options={orderSelectOptions}
                    placeholder="No linked order"
                    searchPlaceholder="Search by order number or customer…"
                    emptyMessage="No order found."
                    portalContainer={complaintDialogEl}
                  />
                </div>
                {selectedOrder ? (
                  <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
                    <p className="font-medium">Customer (from order)</p>
                    <p className="text-muted-foreground">{selectedOrder.customerName}</p>
                    {selectedOrder.customerMobile ? (
                      <p className="text-muted-foreground">{selectedOrder.customerMobile}</p>
                    ) : null}
                    {selectedOrder.customerAddress ? (
                      <AddressOrLink
                        text={selectedOrder.customerAddress}
                        className="text-muted-foreground line-clamp-3"
                      />
                    ) : null}
                  </div>
                ) : null}
                {!formOrderId ? (
                  <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                    <p className="text-sm font-medium">Customer details</p>
                    <div className="space-y-2">
                      <Label htmlFor="complaint-customer-name">Name *</Label>
                      <Input
                        id="complaint-customer-name"
                        value={formCustomerName}
                        onChange={(e) => setFormCustomerName(e.target.value)}
                        placeholder="Customer name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="complaint-customer-mobile">Mobile</Label>
                      <Input
                        id="complaint-customer-mobile"
                        value={formCustomerMobile}
                        onChange={(e) => setFormCustomerMobile(e.target.value)}
                        placeholder="Phone number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="complaint-customer-address">Address / location link</Label>
                      <Textarea
                        id="complaint-customer-address"
                        rows={3}
                        value={formCustomerAddress}
                        onChange={(e) => setFormCustomerAddress(e.target.value)}
                        placeholder="Street address or Google Maps link (https://maps.google.com/…)"
                      />
                      {isExternalLinkText(formCustomerAddress) ? (
                        <p className="text-xs text-muted-foreground">
                          Saved as a location link — it will open in maps from the complaint detail.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label>Product (optional)</Label>
                  <SearchableSelect
                    value={formProductId}
                    onValueChange={setFormProductId}
                    options={orderProductSelectOptions}
                    placeholder="All products on order"
                    searchPlaceholder="Search product…"
                    emptyMessage="No product found."
                    disabled={!formOrderId}
                    portalContainer={complaintDialogEl}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Subject</Label>
              <Input value={formSubject} onChange={(e) => setFormSubject(e.target.value)} placeholder="Short title" />
            </div>

            {!partnerUser && can("complaints", "add") ? (
              <div className="space-y-2">
                <Label>Assign to (staff)</Label>
                <AssigneesMultiSelect
                  options={assignableUsers.map((u) => ({ id: u.id, name: u.name, mobile: u.mobile }))}
                  value={formAssigneeIds}
                  onChange={setFormAssigneeIds}
                  disabled={writeBranchId == null}
                  placeholder={
                    writeBranchId == null
                      ? "Select a branch in the header first"
                      : assignableUsers.length === 0
                        ? "No staff available for this branch"
                        : "Select staff who will handle this complaint…"
                  }
                />
                {/* <p className="text-xs text-muted-foreground">
                  Only assigned staff and Super Admin can change complaint status.
                </p> */}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Issue / problem description *</Label>
              <Textarea
                rows={4}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Describe the issue in detail…"
              />
            </div>

            <div className="space-y-3 border-t border-border/60 pt-4">
              <div>
                <p className="text-sm font-semibold">Issue photos</p>
                {/* <p className="text-xs text-muted-foreground">Optional. Camera or gallery.</p> */}
              </div>
              <input
                id="complaint-create-photo-input"
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  void handleDialogImageUpload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {formImages.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {formImages.map((url) => (
                    <div key={url} className="relative aspect-square overflow-hidden rounded-lg border">
                      <img src={resolvedProductImageUrl(url)} alt="" className="h-full w-full object-cover" />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="absolute right-1 top-1 h-7 w-7 rounded-xl"
                        onClick={() => setFormImages((prev) => prev.filter((u) => u !== url))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <label
                    htmlFor="complaint-create-photo-input"
                    className={cn(
                      "flex aspect-square cursor-pointer items-center justify-center rounded-lg border-2 border-dashed bg-muted/25",
                      uploading && "pointer-events-none opacity-50",
                    )}
                  >
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  </label>
                </div>
              ) : (
                <div className="relative overflow-hidden rounded-xl border-2 border-dashed bg-muted/25">
                  <label
                    htmlFor="complaint-create-photo-input"
                    className={cn(
                      "flex aspect-[4/3] max-h-[140px] w-full cursor-pointer items-center justify-center p-4",
                      uploading && "pointer-events-none opacity-50",
                    )}
                  >
                    <div className="flex flex-col items-center gap-2 text-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm font-medium">Add photo</span>
                    </div>
                  </label>
                </div>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-xl"
                disabled={uploading}
                onClick={() => document.getElementById("complaint-create-photo-input")?.click()}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {uploading ? "Uploading…" : formImages.length > 0 ? "Add another" : "Upload"}
              </Button>
            </div>
          </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={createDisabled || createMut.isPending} onClick={() => createMut.mutate()}>
              Save complaint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) {
            setDeleteInput("");
            setSingleDeleteId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm deletion</DialogTitle>
            <DialogDescription>To delete this complaint, type &quot;DELETE&quot; below.</DialogDescription>
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
                setSingleDeleteId(null);
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


