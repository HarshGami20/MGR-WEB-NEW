import { customFetch } from "@/api-client/custom-fetch";

export type Driver = {
  id: number;
  branchId: number | null;
  name: string;
  mobile: string | null;
  vehicleInfo: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  branch: { id: number; name: string; code: string } | null;
  deliveryCount: number;
  paymentCount: number;
};

export type DriverOrderRow = {
  id: number;
  orderNumber: string;
  customerName: string;
  customerMobile: string | null;
  deliveryDate: string | null;
  deliveryStatus: string;
  deliveryCharge: number;
  status: string;
  totalAmount: number;
  branch: { id: number; name: string; code: string } | null;
};

export type DriverPayment = {
  id: number;
  driverId: number;
  orderId: number | null;
  amount: number;
  mode: string;
  reference: string | null;
  notes: string | null;
  paidAt: string;
  createdAt: string;
  order: { id: number; orderNumber: string } | null;
  recordedBy: string | null;
};

export type DriverDetail = Driver & {
  orders: DriverOrderRow[];
  payments: DriverPayment[];
  paidTotal: number;
};

export async function listDrivers(params: {
  search?: string;
  branchId?: number;
  page?: number;
  limit?: number;
  isActive?: boolean;
}): Promise<{ data: Driver[]; total: number; page: number; limit: number }> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.branchId != null) qs.set("branchId", String(params.branchId));
  if (params.page != null) qs.set("page", String(params.page));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.isActive === true) qs.set("isActive", "true");
  if (params.isActive === false) qs.set("isActive", "false");
  const suffix = qs.size > 0 ? `?${qs}` : "";
  const headers: Record<string, string> = {};
  if (params.branchId != null) headers["X-Branch-Id"] = String(params.branchId);
  return customFetch(`/api/drivers${suffix}`, { headers });
}

export async function getDriver(id: number): Promise<DriverDetail> {
  return customFetch<DriverDetail>(`/api/drivers/${id}`);
}

export async function createDriver(body: {
  name: string;
  mobile?: string | null;
  vehicleInfo?: string | null;
  notes?: string | null;
  branchId?: number | null;
}): Promise<Driver> {
  return customFetch<Driver>("/api/drivers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateDriver(
  id: number,
  body: {
    name: string;
    mobile?: string | null;
    vehicleInfo?: string | null;
    notes?: string | null;
    isActive?: boolean;
    branchId?: number | null;
  },
): Promise<Driver> {
  return customFetch<Driver>(`/api/drivers/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteDriver(id: number): Promise<void> {
  await customFetch(`/api/drivers/${id}`, { method: "DELETE" });
}

export async function listDriverPayments(params: {
  driverId?: number;
  orderId?: number;
  branchId?: number;
  page?: number;
  limit?: number;
}): Promise<{ data: DriverPayment[]; total: number; page: number; limit: number }> {
  const qs = new URLSearchParams();
  if (params.driverId != null) qs.set("driverId", String(params.driverId));
  if (params.orderId != null) qs.set("orderId", String(params.orderId));
  if (params.page != null) qs.set("page", String(params.page));
  if (params.limit != null) qs.set("limit", String(params.limit));
  const suffix = qs.size > 0 ? `?${qs}` : "";
  const headers: Record<string, string> = {};
  if (params.branchId != null) headers["X-Branch-Id"] = String(params.branchId);
  return customFetch(`/api/driver-payments${suffix}`, { headers });
}

export async function createDriverPayment(body: {
  driverId: number;
  orderId?: number | null;
  amount: number;
  mode?: string;
  reference?: string | null;
  notes?: string | null;
  paidAt?: string;
}): Promise<DriverPayment> {
  return customFetch<DriverPayment>("/api/driver-payments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
