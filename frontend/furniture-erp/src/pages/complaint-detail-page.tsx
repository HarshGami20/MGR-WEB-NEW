import { useMemo, useState, type ReactNode } from "react";
import { Link, Redirect, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getComplaint,
  updateComplaintStatus,
  addComplaintComment,
  uploadComplaintImage,
  updateComplaint,
  listComplaintAssignableUsers,
  type ComplaintStatus,
} from "@/lib/complaint-api";
import { canUpdateComplaintStatus } from "@/lib/complaint-status-access";
import { resolvedProductImageUrl } from "@/lib/product-image-url";
import { useBranch, assignedUserBranchIds, isSuperAdminUser } from "@/lib/branch-context";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AssigneesMultiSelect } from "@/components/assignees-multi-select";
import {
  OrderImageGalleryDialog,
  type GallerySlide,
} from "@/components/order-image-gallery-dialog";
import { isPartnerPortalUser } from "@/lib/partner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Calendar,
  Upload,
  User,
  Package,
  MessageSquare,
  Users,
} from "lucide-react";

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

function formatCommentDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function DetailSection({
  title,
  description,
  children,
  className,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border/60 bg-card p-5 shadow-sm md:p-6 space-y-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {description ? <p className="text-xs text-muted-foreground mt-0.5">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function InfoRow({
  label,
  value,
  icon,
  mono,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  mono?: boolean;
}) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div className="flex gap-3 py-2.5 border-b border-border/50 last:border-0 last:pb-0">
      {icon ? <span className="text-muted-foreground shrink-0 mt-0.5">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("text-sm text-foreground mt-0.5 break-words", mono && "font-mono")}>{value}</p>
      </div>
    </div>
  );
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
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: complaint, isLoading, isError } = useQuery({
    queryKey: ["complaint", id],
    queryFn: () => getComplaint(id),
    enabled: Number.isFinite(id) && id > 0,
  });

  const branchIdForAssignees = complaint?.branchId ?? writeBranchId;

  const { data: assignableUsersData } = useQuery({
    queryKey: ["complaint-assignable-users", branchIdForAssignees],
    queryFn: () => listComplaintAssignableUsers(branchIdForAssignees!),
    enabled: branchIdForAssignees != null && can("complaints", "edit") && !partnerUser,
  });

  const assignableUsers = useMemo(() => assignableUsersData?.data ?? [], [assignableUsersData?.data]);

  const assigneeIds = useMemo(
    () => (complaint?.assignees ?? []).map((a) => a.id),
    [complaint?.assignees],
  );

  const mayEditAssignees = can("complaints", "edit") && !partnerUser;
  const mayChangeStatus = complaint ? canUpdateComplaintStatus(user, complaint) : false;
  const mayEditContent = can("complaints", "edit");

  const statusMut = useMutation({
    mutationFn: (status: ComplaintStatus) => updateComplaintStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaint", id] });
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      toast({ title: "Status updated" });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const assigneesMut = useMutation({
    mutationFn: (assigneeUserIds: number[]) => updateComplaint(id, { assigneeUserIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaint", id] });
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      toast({ title: "Assignees updated" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
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

  const gallerySlides: GallerySlide[] = useMemo(() => {
    if (!complaint) return [];
    return complaint.imageUrls.map((url) => ({
      src: resolvedProductImageUrl(url) ?? url,
      caption: null,
    }));
  }, [complaint]);

  if (!Number.isFinite(id) || id <= 0) return <Redirect to="/complaints" />;
  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-6rem)] items-center justify-center text-muted-foreground">
        Loading complaint…
      </div>
    );
  }
  if (isError || !complaint) {
    return (
      <div className="min-h-[calc(100vh-6rem)] bg-muted/40 -mx-4 -mt-4 px-4 py-6 md:-mx-8 md:px-8 flex items-center justify-center">
        <p className="text-muted-foreground">Complaint not found.</p>
      </div>
    );
  }

  const order = complaint.order;
  const purchaseOrder = complaint.purchaseOrder;
  const isPoComplaint = complaint.kind === "purchase_order";
  const assigneeLabel =
    complaint.assignees.length > 0
      ? complaint.assignees.map((a) => a.name).join(", ")
      : null;

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-muted/40 -mx-4 -mt-4 px-4 py-6 md:-mx-8 md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <Link href="/complaints">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-0.5 shrink-0 rounded-full"
                aria-label="Back to complaints"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight font-mono md:text-2xl">
                  {complaint.complaintNumber}
                </h1>
                {getComplaintStatusBadge(complaint.status)}
                {complaint.branch?.name ? (
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    {complaint.branch.name}
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                {formatCommentDateTime(complaint.createdAt)}
                {complaint.subject ? (
                  <>
                    <span className="text-border">·</span>
                    <span className="font-medium text-foreground">{complaint.subject}</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            <DetailSection title="Issue description" description="Reported problem details">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{complaint.description}</p>
            </DetailSection>

            <DetailSection
              title={isPoComplaint ? "Purchase order" : "Customer & order"}
              description={isPoComplaint ? "Linked purchase order" : "Linked sales order and customer"}
            >
              {isPoComplaint ? (
                purchaseOrder ? (
                  <div className="rounded-lg border bg-muted/10 px-3 py-1">
                    <InfoRow
                      label="PO number"
                      value={
                        <Link
                          href={`/purchase-orders/${purchaseOrder.id}`}
                          className="text-primary hover:underline font-mono"
                        >
                          {purchaseOrder.poNumber}
                        </Link>
                      }
                      mono
                    />
                    <InfoRow label="Type" value={purchaseOrder.type} />
                    <InfoRow label="PO status" value={purchaseOrder.status.replace(/_/g, " ")} />
                    {purchaseOrder.branch?.name ? (
                      <InfoRow label="Branch" value={purchaseOrder.branch.name} />
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Purchase order not found</p>
                )
              ) : order ? (
                <div className="rounded-lg border bg-muted/10 px-3 py-1">
                  <InfoRow label="Customer" value={order.customerName} icon={<User className="h-4 w-4" />} />
                  <InfoRow label="Mobile" value={order.customerMobile ?? "—"} />
                  <InfoRow label="Address" value={order.customerAddress ?? "—"} />
                  <InfoRow
                    label="Order"
                    value={
                      <Link href={`/orders/${order.id}`} className="text-primary hover:underline font-mono">
                        {order.orderNumber}
                      </Link>
                    }
                    mono
                  />
                  <InfoRow label="Order status" value={order.status.replace(/_/g, " ")} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Order not found</p>
              )}
              {complaint.createdBy?.name ? (
                <p className="text-xs text-muted-foreground pt-1">
                  Registered by <span className="font-medium text-foreground">{complaint.createdBy.name}</span>
                </p>
              ) : null}
            </DetailSection>

            {complaint.product ? (
              <DetailSection title="Product" description="Specific item this complaint refers to">
                <div className="flex gap-4 items-start">
                  {complaint.product.imageUrl ? (
                    <img
                      src={resolvedProductImageUrl(complaint.product.imageUrl)}
                      alt=""
                      className="h-16 w-16 rounded-lg border object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-lg border bg-muted/30 flex items-center justify-center shrink-0">
                      <Package className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium">{complaint.product.name}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">SKU: {complaint.product.sku}</p>
                  </div>
                </div>
              </DetailSection>
            ) : (
              <DetailSection title="Product scope" description="Applies to all line items">
                <p className="text-sm text-muted-foreground">
                  {isPoComplaint ? "All items on this purchase order" : "All items on this order"}
                </p>
              </DetailSection>
            )}

            {(isPoComplaint && purchaseOrder?.items && purchaseOrder.items.length > 0) ||
            (!isPoComplaint && order?.items && order.items.length > 0) ? (
              <DetailSection title="Line items" description="Products on the linked document">
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit (₹)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(isPoComplaint ? purchaseOrder!.items : order!.items).map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            {"isCustom" in item && item.isCustom
                              ? item.customName ?? "Custom item"
                              : item.product?.name ?? `Product #${item.productId}`}
                          </TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.unitPrice.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </DetailSection>
            ) : null}

            <DetailSection
              title="Issue photos"
              description={`${complaint.imageUrls.length} photo${complaint.imageUrls.length === 1 ? "" : "s"}`}
            >
              <input
                id="complaint-detail-photo-input"
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={uploading || !mayEditContent}
                onChange={(e) => {
                  void handleImageUpload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {complaint.imageUrls.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {complaint.imageUrls.map((url, idx) => (
                    <button
                      key={url}
                      type="button"
                      className="aspect-square overflow-hidden rounded-xl border bg-muted/20 hover:opacity-90 transition-opacity"
                      onClick={() => setGalleryIndex(idx)}
                    >
                      <img
                        src={resolvedProductImageUrl(url)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No photos attached yet.</p>
              )}
              {mayEditContent && (
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
            </DetailSection>

            <DetailSection
              title="Comments"
              description={
                partnerUser
                  ? "Discussion with MGR CASA on this complaint"
                  : "Internal notes (not visible to customers)"
              }
            >
              {complaint.comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              ) : (
                <ul className="space-y-3">
                  {complaint.comments.map((c) => (
                    <li key={c.id} className="rounded-xl border bg-muted/20 p-3 text-sm">
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{c.user.name}</span>
                        <span>{formatCommentDateTime(c.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap">{c.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              {mayEditContent && (
                <div className="space-y-2 border-t border-border/50 pt-4">
                  <Textarea
                    rows={3}
                    placeholder="Add a comment…"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                  />
                  <Button
                    size="sm"
                    className="rounded-xl"
                    disabled={!commentText.trim() || commentMut.isPending}
                    onClick={() => commentMut.mutate()}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Post comment
                  </Button>
                </div>
              )}
            </DetailSection>
          </div>

          <div className="space-y-6 lg:col-span-4">
            <DetailSection title="Complaint status" description="Workflow state">
              {mayChangeStatus ? (
                <Select
                  value={complaint.status}
                  onValueChange={(v) => statusMut.mutate(v as ComplaintStatus)}
                  disabled={statusMut.isPending}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="space-y-2">
                  {getComplaintStatusBadge(complaint.status)}
                  {mayEditContent && !isSuperAdminUser(user) ? (
                    <p className="text-xs text-muted-foreground">
                      Only complaint assignees or Super Admin can change status.
                    </p>
                  ) : null}
                </div>
              )}
              {complaint.resolvedAt ? (
                <p className="text-xs text-muted-foreground">
                  Resolved {formatCommentDateTime(complaint.resolvedAt)}
                </p>
              ) : null}
            </DetailSection>

            {!partnerUser ? (
              <DetailSection
                title="Assigned staff"
                description="Only assignees and Super Admin can update status"
              >
                {mayEditAssignees ? (
                  branchIdForAssignees != null ? (
                    <AssigneesMultiSelect
                      options={assignableUsers.map((u) => ({
                        id: u.id,
                        name: u.name,
                        mobile: u.mobile,
                      }))}
                      value={assigneeIds}
                      onChange={(ids) => assigneesMut.mutate(ids)}
                      disabled={assigneesMut.isPending}
                      placeholder={
                        assignableUsers.length === 0
                          ? "No staff available for this branch"
                          : "Select staff to handle this complaint…"
                      }
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Select a branch in the header to assign staff.
                    </p>
                  )
                ) : assigneeLabel ? (
                  <p className="text-sm">
                    <Users className="inline h-4 w-4 mr-1.5 text-muted-foreground" />
                    {assigneeLabel}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No staff assigned yet.</p>
                )}
              </DetailSection>
            ) : assigneeLabel ? (
              <DetailSection title="Assigned staff">
                <p className="text-sm">{assigneeLabel}</p>
              </DetailSection>
            ) : null}
          </div>
        </div>
      </div>

      <OrderImageGalleryDialog
        open={galleryIndex != null}
        slides={gallerySlides}
        index={galleryIndex ?? 0}
        onIndexChange={(next) => setGalleryIndex(next)}
        onClose={() => setGalleryIndex(null)}
      />
    </div>
  );
}
