import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTablePaginationFooter } from "@/components/data-table";
import { useListOrders } from "@/api-client";
import { useBranch, assignedUserBranchIds } from "@/lib/branch-context";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import {
  listComplaints,
  createComplaint,
  deleteComplaint,
  updateComplaintStatus,
  uploadComplaintImage,
  type Complaint,
  type ComplaintStatus,
} from "@/lib/complaint-api";
import { resolvedProductImageUrl } from "@/lib/product-image-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const { selectedBranchId } = useBranch();
  const assigned = assignedUserBranchIds(user);

  const branchId = selectedBranchId ?? undefined;
  const writeBranchId =
    assigned.length === 1
      ? assigned[0]!
      : assigned.length > 1
        ? selectedBranchId != null && assigned.includes(selectedBranchId)
          ? selectedBranchId
          : null
        : selectedBranchId;

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [singleDeleteId, setSingleDeleteId] = useState<number | null>(null);

  const [formOrderId, setFormOrderId] = useState("");
  const [formProductId, setFormProductId] = useState("none");
  const [formSubject, setFormSubject] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formImages, setFormImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const { data: complaintsData, isLoading } = useQuery({
    queryKey: ["complaints", search, status, branchId, page],
    queryFn: () =>
      listComplaints({
        search: search || undefined,
        status: status !== "all" ? (status as ComplaintStatus) : undefined,
        branchId,
        page,
        limit: 10,
      }),
  });

  const { data: ordersData } = useListOrders({
    branchId,
    limit: 200,
    page: 1,
  });

  const complaints = complaintsData?.data ?? [];

  const selectedOrder = useMemo(() => {
    const id = parseInt(formOrderId, 10);
    if (!Number.isFinite(id)) return null;
    return ordersData?.data?.find((o) => o.id === id) ?? null;
  }, [formOrderId, ordersData]);

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
    mutationFn: () =>
      createComplaint({
        orderId: parseInt(formOrderId, 10),
        productId: formProductId !== "none" ? parseInt(formProductId, 10) : null,
        subject: formSubject.trim() || null,
        description: formDescription.trim(),
        imageUrls: formImages.length > 0 ? formImages : undefined,
      }),
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
    setFormProductId("none");
    setFormSubject("");
    setFormDescription("");
    setFormImages([]);
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
    if (!file.type.startsWith("image/")) {
      toast({ title: "Choose an image file", variant: "destructive" });
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
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const columns = useMemo<ColumnDef<Complaint>[]>(
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
            <span className="block truncate font-medium" title={row.original.order?.customerName}>
              {row.original.order?.customerName ?? "—"}
            </span>
            <span className="text-xs text-muted-foreground">{row.original.order?.customerMobile ?? ""}</span>
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
          can("complaints", "edit") ? (
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
    [can, openDetailPage, statusMut],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Complaints</h2>
          <p className="text-muted-foreground">Manage customer complaints linked to orders</p>
        </div>
        {can("complaints", "add") && (
          <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            New complaint
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg border">
        <div className="flex flex-1 gap-4 items-center flex-wrap">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search complaints..."
              className="pl-8"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
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
          emptyMessage="No complaints found."
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Register complaint</DialogTitle>
            <DialogDescription>Link an order, describe the issue, and attach photos if needed.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Linked order *</Label>
              <Select value={formOrderId} onValueChange={(v) => { setFormOrderId(v); setFormProductId("none"); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select order" />
                </SelectTrigger>
                <SelectContent>
                  {(ordersData?.data ?? []).map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.orderNumber} — {o.customerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedOrder && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="font-medium">Order summary</p>
                <p className="text-muted-foreground">{selectedOrder.customerMobile}</p>
                <p className="mt-1 text-muted-foreground line-clamp-2">{selectedOrder.customerAddress}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Product (optional)</Label>
              <Select value={formProductId} onValueChange={setFormProductId} disabled={!formOrderId}>
                <SelectTrigger>
                  <SelectValue placeholder="All products on order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All / general issue</SelectItem>
                  {(selectedOrder?.items ?? []).map((item: { productId: number; product?: { name?: string } | null }) => (
                    <SelectItem key={item.productId} value={String(item.productId)}>
                      {item.product?.name ?? `Product #${item.productId}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Subject</Label>
              <Input value={formSubject} onChange={(e) => setFormSubject(e.target.value)} placeholder="Short title" />
            </div>

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
                <p className="text-xs text-muted-foreground">Optional. Camera or gallery.</p>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!formOrderId || !formDescription.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
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
