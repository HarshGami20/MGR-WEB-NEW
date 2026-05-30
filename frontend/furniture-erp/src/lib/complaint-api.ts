import { customFetch } from "@/api-client/custom-fetch";

export type ComplaintStatus = "open" | "in_progress" | "resolved";
export type ComplaintKind = "sales_order" | "purchase_order";

export type ComplaintProduct = {
  id: number;
  name: string;
  sku: string;
  imageUrl: string | null;
  price: number;
  gstPercent: number;
  description: string | null;
};

export type ComplaintOrderItem = {
  id: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  product: ComplaintProduct | null;
};

export type ComplaintOrder = {
  id: number;
  orderNumber: string;
  customerName: string;
  customerMobile: string | null;
  customerAddress: string | null;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  createdAt: string;
  items: ComplaintOrderItem[];
};

export type ComplaintPurchaseOrderItem = {
  id: number;
  productId: number | null;
  isCustom: boolean;
  customName: string | null;
  quantity: number;
  unitPrice: number;
  product: ComplaintProduct | null;
};

export type ComplaintPurchaseOrder = {
  id: number;
  poNumber: string;
  status: string;
  type: string;
  totalAmount: number;
  branch: { id: number; name: string; code: string } | null;
  items: ComplaintPurchaseOrderItem[];
};

export type ComplaintComment = {
  id: number;
  body: string;
  createdAt: string;
  user: { id: number; name: string; mobile: string; avatarUrl: string | null };
};

export type ComplaintAssignee = { id: number; name: string; mobile: string };

export type ComplaintAssignableUser = ComplaintAssignee & {
  role?: { name: string | null } | null;
};

export type Complaint = {
  id: number;
  complaintNumber: string;
  kind: ComplaintKind;
  orderId: number | null;
  purchaseOrderId: number | null;
  productId: number | null;
  branchId: number | null;
  createdById: number | null;
  subject: string | null;
  description: string;
  status: ComplaintStatus;
  imageUrls: string[];
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  order: ComplaintOrder | null;
  purchaseOrder: ComplaintPurchaseOrder | null;
  product: ComplaintProduct | null;
  branch: { id: number; name: string; code: string } | null;
  createdBy: { id: number; name: string; mobile: string; avatarUrl: string | null } | null;
  assignees: ComplaintAssignee[];
  comments: ComplaintComment[];
};

export type ComplaintsListResponse = {
  data: Complaint[];
  total: number;
  page: number;
  limit: number;
};

/** @deprecated Import from `@/lib/upload-image-api` instead. */
export { uploadComplaintImage } from "@/lib/upload-image-api";

export async function listComplaints(params: {
  search?: string;
  status?: ComplaintStatus;
  kind?: ComplaintKind;
  branchId?: number;
  orderId?: number;
  purchaseOrderId?: number;
  createdFrom?: string;
  createdTo?: string;
  categoryId?: number;
  page?: number;
  limit?: number;
}): Promise<ComplaintsListResponse> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.status) qs.set("status", params.status);
  if (params.kind) qs.set("kind", params.kind);
  if (params.branchId != null) qs.set("branchId", String(params.branchId));
  if (params.orderId != null) qs.set("orderId", String(params.orderId));
  if (params.purchaseOrderId != null) qs.set("purchaseOrderId", String(params.purchaseOrderId));
  if (params.createdFrom) qs.set("createdFrom", params.createdFrom);
  if (params.createdTo) qs.set("createdTo", params.createdTo);
  if (params.categoryId != null) qs.set("categoryId", String(params.categoryId));
  qs.set("page", String(params.page ?? 1));
  qs.set("limit", String(params.limit ?? 20));
  return customFetch<ComplaintsListResponse>(`/api/complaints?${qs}`);
}

export async function getComplaint(id: number): Promise<Complaint> {
  return customFetch<Complaint>(`/api/complaints/${id}`);
}

export async function listComplaintAssignableUsers(
  branchId: number,
  params?: { search?: string; limit?: number },
): Promise<{ data: ComplaintAssignableUser[] }> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  const suffix = qs.size > 0 ? `?${qs}` : "";
  return customFetch<{ data: ComplaintAssignableUser[] }>(`/api/complaints/assignable-users${suffix}`, {
    headers: { "X-Branch-Id": String(branchId) },
  });
}

export async function createComplaint(body: {
  kind?: ComplaintKind;
  orderId?: number;
  purchaseOrderId?: number;
  productId?: number | null;
  subject?: string | null;
  description: string;
  imageUrls?: string[];
  assigneeUserIds?: number[];
}): Promise<Complaint> {
  return customFetch<Complaint>("/api/complaints", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateComplaint(
  id: number,
  body: {
    productId?: number | null;
    subject?: string | null;
    description?: string;
    imageUrls?: string[];
    assigneeUserIds?: number[];
  },
): Promise<Complaint> {
  return customFetch<Complaint>(`/api/complaints/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateComplaintStatus(id: number, status: ComplaintStatus): Promise<Complaint> {
  return customFetch<Complaint>(`/api/complaints/${id}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export async function addComplaintComment(id: number, body: string): Promise<ComplaintComment> {
  return customFetch<ComplaintComment>(`/api/complaints/${id}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

export async function deleteComplaint(id: number): Promise<void> {
  await customFetch(`/api/complaints/${id}`, { method: "DELETE" });
}
