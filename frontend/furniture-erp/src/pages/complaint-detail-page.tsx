import { useState } from "react";
import { Link, Redirect, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getComplaint,
  updateComplaintStatus,
  addComplaintComment,
  uploadComplaintImage,
  updateComplaint,
  type ComplaintStatus,
} from "@/lib/complaint-api";
import { resolvedProductImageUrl } from "@/lib/product-image-url";
import { useBranch, assignedUserBranchIds } from "@/lib/branch-context";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { isPartnerPortalUser } from "@/lib/partner";
import { ArrowLeft, Upload } from "lucide-react";

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

export default function ComplaintDetailPage() {
  const [, params] = useRoute("/complaints/:id");
  const id = parseInt(params?.id ?? "", 10);
  const { can } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const partnerUser = isPartnerPortalUser(user);
  const { selectedBranchId } = useBranch();
  const assigned = assignedUserBranchIds(user);
  const writeBranchId =
    assigned.length === 1
      ? assigned[0]!
      : assigned.length > 1
        ? selectedBranchId != null && assigned.includes(selectedBranchId)
          ? selectedBranchId
          : null
        : selectedBranchId;

  const [commentText, setCommentText] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: complaint, isLoading, isError } = useQuery({
    queryKey: ["complaint", id],
    queryFn: () => getComplaint(id),
    enabled: Number.isFinite(id) && id > 0,
  });

  const statusMut = useMutation({
    mutationFn: (status: ComplaintStatus) => updateComplaintStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaint", id] });
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      toast({ title: "Status updated" });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const commentMut = useMutation({
    mutationFn: () => addComplaintComment(id, commentText.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaint", id] });
      setCommentText("");
      toast({ title: "Comment added" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const imagesMut = useMutation({
    mutationFn: (imageUrls: string[]) => updateComplaint(id, { imageUrls }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaint", id] });
      toast({ title: "Images updated" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const handleImageUpload = async (file: File | undefined) => {
    if (!file || !complaint) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Choose an image file", variant: "destructive" });
      return;
    }
    try {
      setUploading(true);
      const { imageUrl } = await uploadComplaintImage(file, writeBranchId);
      await imagesMut.mutateAsync([...complaint.imageUrls, imageUrl]);
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

  if (!Number.isFinite(id) || id <= 0) return <Redirect to="/complaints" />;
  if (isLoading) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading complaint…</div>;
  if (isError || !complaint) return <div className="text-muted-foreground">Complaint not found.</div>;

  const order = complaint.order;
  const purchaseOrder = complaint.purchaseOrder;
  const isPoComplaint = complaint.kind === "purchase_order";

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-[hsl(0_0%_97%)] -mx-4 -mt-4 px-4 py-8 md:-mx-8 md:px-8 md:py-10">
      <div className="max-w-4xl space-y-6">
        <Link href="/complaints">
          <Button type="button" variant="ghost" className="mb-2 -ml-2 gap-2 text-foreground hover:bg-transparent hover:text-foreground/80">
            <ArrowLeft className="h-4 w-4" />
            Back to complaints
          </Button>
        </Link>

        <div className="rounded-xl border border-border/60 bg-white p-5 space-y-5">
          <div className="flex justify-between items-start border-b pb-4 gap-4">
            <div>
              <h1 className="font-bold text-2xl tracking-tight font-mono">{complaint.complaintNumber}</h1>
              <p className="text-sm text-muted-foreground mt-1">{new Date(complaint.createdAt).toLocaleString()}</p>
              {complaint.subject ? <p className="text-sm mt-2 font-medium">{complaint.subject}</p> : null}
            </div>
            {getComplaintStatusBadge(complaint.status)}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-sm font-semibold mb-2">
                {isPoComplaint ? "Purchase order" : "Customer & order"}
              </h2>
              {isPoComplaint ? (
                purchaseOrder ? (
                  <>
                    <p className="text-sm mt-2">
                      PO:{" "}
                      <Link
                        href={`/purchase-orders/${purchaseOrder.id}`}
                        className="font-mono text-primary hover:underline"
                      >
                        {purchaseOrder.poNumber}
                      </Link>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 capitalize">
                      Type: {purchaseOrder.type} · Status: {purchaseOrder.status.replace(/_/g, " ")}
                    </p>
                    {purchaseOrder.branch?.name ? (
                      <p className="text-xs text-muted-foreground mt-1">Branch: {purchaseOrder.branch.name}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Purchase order not found</p>
                )
              ) : order ? (
                <>
                  <p className="text-sm font-medium">{order.customerName}</p>
                  <p className="text-sm text-muted-foreground">{order.customerMobile || "—"}</p>
                  <p className="text-sm text-muted-foreground">{order.customerAddress || "—"}</p>
                  <p className="text-sm mt-2">
                    Order:{" "}
                    <Link href={`/orders/${order.id}`} className="font-mono text-primary hover:underline">
                      {order.orderNumber}
                    </Link>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 capitalize">
                    Order status: {order.status.replace(/_/g, " ")}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Order not found</p>
              )}
              {complaint.createdBy?.name ? (
                <p className="text-xs text-muted-foreground mt-2">Registered by {complaint.createdBy.name}</p>
              ) : null}
            </div>
            <div className="md:text-right">
              <h2 className="text-sm font-semibold mb-2">Complaint status</h2>
              {can("complaints", "edit") ? (
                <Select
                  value={complaint.status}
                  onValueChange={(v) => statusMut.mutate(v as ComplaintStatus)}
                >
                  <SelectTrigger className="w-[180px] md:ml-auto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                getComplaintStatusBadge(complaint.status)
              )}
              {complaint.product ? (
                <div className="mt-4 text-sm md:text-right">
                  <p className="font-semibold">Product</p>
                  <p>{complaint.product.name}</p>
                  <p className="text-muted-foreground text-xs">SKU: {complaint.product.sku}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mt-4">
                  {isPoComplaint ? "All items on PO" : "All items on order"}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 p-4 space-y-2">
            <h3 className="text-lg font-semibold">Issue description</h3>
            <p className="text-sm whitespace-pre-wrap">{complaint.description}</p>
          </div>

          {isPoComplaint && purchaseOrder?.items && purchaseOrder.items.length > 0 ? (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrder.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {item.isCustom
                          ? item.customName ?? "Custom item"
                          : item.product?.name ?? `Product #${item.productId}`}
                      </TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.unitPrice.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}

          {!isPoComplaint && order?.items && order.items.length > 0 ? (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.product?.name ?? `Product #${item.productId}`}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.unitPrice.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}

          <div className="rounded-xl border border-border/60 p-4 space-y-3">
            <h3 className="text-lg font-semibold">Issue photos</h3>
            <input
              id="complaint-detail-photo-input"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={uploading || !can("complaints", "edit")}
              onChange={(e) => {
                void handleImageUpload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap gap-3">
              {complaint.imageUrls.map((url) => (
                <button
                  key={url}
                  type="button"
                  className="h-24 w-24 overflow-hidden rounded-lg border"
                  onClick={() => setPreviewImage(resolvedProductImageUrl(url) ?? url)}
                >
                  <img src={resolvedProductImageUrl(url)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
            {can("complaints", "edit") && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-xl"
                disabled={uploading}
                onClick={() => document.getElementById("complaint-detail-photo-input")?.click()}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {uploading ? "Uploading…" : "Add photo"}
              </Button>
            )}
          </div>

          <div className="rounded-xl border border-border/60 p-4 space-y-4">
            <h3 className="text-lg font-semibold">Comments</h3>
            <p className="text-xs text-muted-foreground">
              {partnerUser ? "Discussion with MGR CASA on this complaint" : "Internal notes (not visible to customers)"}
            </p>
            {complaint.comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No internal comments yet.</p>
            ) : (
              <ul className="space-y-3">
                {complaint.comments.map((c) => (
                  <li key={c.id} className="rounded-lg border bg-muted/20 p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{c.user.name}</span>
                      <span>{new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
              </ul>
            )}
            {can("complaints", "edit") && (
              <div className="space-y-2 border-t pt-4">
                <Textarea
                  rows={3}
                  placeholder="Add an internal comment…"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={!commentText.trim() || commentMut.isPending}
                  onClick={() => commentMut.mutate()}
                >
                  Post comment
                </Button>
              </div>
            )}
          </div>
        </div>

        <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
          <DialogContent className="max-w-3xl p-2">
            {previewImage ? (
              <img src={previewImage} alt="" className="max-h-[80vh] w-full object-contain rounded-lg" />
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

