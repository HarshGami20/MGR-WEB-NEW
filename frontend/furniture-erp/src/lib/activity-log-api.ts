import { customFetch } from "@/api-client/custom-fetch";

export type ActivityLogRow = {
  id: number;
  userId: number | null;
  user: { id: number; name: string; mobile: string } | null;
  action: string;
  module: string;
  entityType: string;
  entityId: string | null;
  branchId: number | null;
  branch: { id: number; name: string } | null;
  summary: string;
  method: string | null;
  path: string | null;
  metadata: unknown;
  createdAt: string;
};

export type ListActivityLogsParams = {
  page?: number;
  limit?: number;
  module?: string;
  action?: string;
  userId?: number;
  branchId?: number;
  entityType?: string;
  search?: string;
  createdFrom?: string;
  createdTo?: string;
};

export type ListActivityLogsResponse = {
  data: ActivityLogRow[];
  total: number;
  page: number;
  limit: number;
};

export async function listActivityLogs(params: ListActivityLogsParams = {}): Promise<ListActivityLogsResponse> {
  const qs = new URLSearchParams();
  if (params.page != null) qs.set("page", String(params.page));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.module) qs.set("module", params.module);
  if (params.action) qs.set("action", params.action);
  if (params.userId != null) qs.set("userId", String(params.userId));
  if (params.branchId != null) qs.set("branchId", String(params.branchId));
  if (params.entityType) qs.set("entityType", params.entityType);
  if (params.search) qs.set("search", params.search);
  if (params.createdFrom) qs.set("createdFrom", params.createdFrom);
  if (params.createdTo) qs.set("createdTo", params.createdTo);
  const query = qs.toString();
  return customFetch<ListActivityLogsResponse>(`/api/activity-logs${query ? `?${query}` : ""}`);
}

export const ACTIVITY_MODULE_LABELS: Record<string, string> = {
  auth: "Auth",
  users: "Users",
  roles: "Roles",
  branches: "Branches",
  categories: "Categories",
  products: "Products",
  inventory: "Inventory",
  orders: "Orders",
  deliveries: "Deliveries",
  payments: "Payments",
  purchaseOrders: "Purchase orders",
  suppliers: "Suppliers",
  manufacturers: "Manufacturers",
  complaints: "Complaints",
  settings: "Settings",
  system: "System",
};

export const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  login: "Login",
  login_failed: "Login failed",
};

export function activityModuleLabel(module: string): string {
  return ACTIVITY_MODULE_LABELS[module] ?? module;
}

export function activityActionLabel(action: string): string {
  return ACTIVITY_ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

function orderNumberFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const response = (metadata as Record<string, unknown>).response;
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  const orderNumber = (response as Record<string, unknown>).orderNumber;
  return typeof orderNumber === "string" && orderNumber.trim() ? orderNumber.trim() : null;
}

/** Human-friendly target label for the activity log table. */
export function activityTargetLabel(row: ActivityLogRow): string {
  const id = row.entityId?.trim();
  if (!id) return row.entityType;

  switch (row.entityType) {
    case "Order": {
      const orderNumber = orderNumberFromMetadata(row.metadata);
      return orderNumber ?? `ORD-${id}`;
    }
    case "Complaint": {
      const meta = row.metadata;
      if (meta && typeof meta === "object" && !Array.isArray(meta)) {
        const response = (meta as Record<string, unknown>).response;
        if (response && typeof response === "object" && !Array.isArray(response)) {
          const complaintNumber = (response as Record<string, unknown>).complaintNumber;
          if (typeof complaintNumber === "string" && complaintNumber.trim()) return complaintNumber.trim();
        }
      }
      return `CMP-${id}`;
    }
    case "PurchaseOrder": {
      const meta = row.metadata;
      if (meta && typeof meta === "object" && !Array.isArray(meta)) {
        const response = (meta as Record<string, unknown>).response;
        if (response && typeof response === "object" && !Array.isArray(response)) {
          const poNumber = (response as Record<string, unknown>).poNumber;
          if (typeof poNumber === "string" && poNumber.trim()) return poNumber.trim();
        }
      }
      return `PO-${id}`;
    }
    default:
      return `${row.entityType} ${id}`;
  }
}

export function activityEntityHref(row: ActivityLogRow): string | null {
  const id = row.entityId ? parseInt(row.entityId, 10) : NaN;
  if (!Number.isFinite(id) || id <= 0) return null;
  switch (row.entityType) {
    case "Order":
      return `/orders/${id}`;
    case "Product":
      return `/products/${id}`;
    case "Complaint":
      return `/complaints/${id}`;
    case "PurchaseOrder":
      return `/purchase-orders/${id}`;
    case "User":
      return `/users`;
    case "Driver":
      return `/drivers/${id}`;
    default:
      return null;
  }
}
