import { useMemo } from "react";
import type { PermissionSet } from "@/api-client";
import { useAuth } from "@/lib/auth";
import { isPartnerPortalUser } from "@/lib/partner";

export type PermissionUiAction = keyof PermissionSet;

/** All ERP modules — keep in sync with backend PERMISSION_MODULE_KEYS. */
export const PERMISSION_MODULES: { key: string; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "users", label: "Users" },
  { key: "roles", label: "Roles" },
  { key: "branches", label: "Branches" },
  { key: "categories", label: "Categories" },
  { key: "products", label: "Products" },
  { key: "inventory", label: "Inventory" },
  { key: "orders", label: "Orders" },
  { key: "deliveries", label: "Deliveries" },
  { key: "invoices", label: "Invoices" },
  { key: "payments", label: "Payments" },
  { key: "reports", label: "Reports" },
  { key: "suppliers", label: "Suppliers" },
  { key: "manufacturers", label: "Manufacturers" },
  { key: "purchaseOrders", label: "Purchase orders" },
  { key: "complaints", label: "Complaints & support" },
  { key: "settings", label: "Settings" },
  { key: "activityLogs", label: "Activity logs" },
];

export function emptyPermissionsMatrix(): Record<string, PermissionSet> {
  const row: PermissionSet = { view: false, add: false, edit: false, delete: false };
  return Object.fromEntries(PERMISSION_MODULES.map(({ key }) => [key, { ...row }]));
}

/** Normalize API/DB permissions into the UI matrix (read↔view, create↔add, update↔edit). */
export function permissionsToFormMatrix(
  raw: Record<string, unknown> | null | undefined,
): Record<string, PermissionSet> {
  const out = emptyPermissionsMatrix();
  if (!raw || typeof raw !== "object") return out;
  for (const { key } of PERMISSION_MODULES) {
    const slice = raw[key];
    if (!slice || typeof slice !== "object") continue;
    const r = slice as Record<string, unknown>;
    out[key] = {
      view: !!(r.view ?? r.read),
      add: !!(r.add ?? r.create),
      edit: !!(r.edit ?? r.update),
      delete: !!r.delete,
    };
  }
  return out;
}

/** Coerce listRoles response (array or `{ data }`) into a role array. */
export function coerceRoleList(data: unknown): { id: number; name: string; permissions?: Record<string, unknown> }[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: { id: number; name: string; permissions?: Record<string, unknown> }[] }).data;
  }
  return [];
}

export function countGrantedPermissions(matrix: Record<string, PermissionSet | undefined> | null | undefined): {
  modules: number;
  actions: number;
} {
  const normalized = permissionsToFormMatrix(matrix as Record<string, unknown> | undefined);
  let actions = 0;
  let modules = 0;
  for (const row of Object.values(normalized)) {
    const n = (row.view ? 1 : 0) + (row.add ? 1 : 0) + (row.edit ? 1 : 0) + (row.delete ? 1 : 0);
    if (n > 0) modules += 1;
    actions += n;
  }
  return { modules, actions };
}

/** Single module slice from DB (supports view/add/edit/delete or read/create/update/delete). */
function normalizeSlice(slice: unknown): PermissionSet | null {
  if (!slice || typeof slice !== "object") return null;
  const r = slice as Record<string, unknown>;
  return {
    view: !!(r.view ?? r.read),
    add: !!(r.add ?? r.create),
    edit: !!(r.edit ?? r.update),
    delete: !!r.delete,
  };
}

/** Full role.permissions object → UI matrix. */
export function normalizePermissions(
  raw: Record<string, PermissionSet | undefined> | null | undefined
): Record<string, PermissionSet> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, PermissionSet> = {};
  for (const [key, val] of Object.entries(raw)) {
    const row = normalizeSlice(val);
    if (row) out[key] = row;
  }
  return out;
}

export const ROUTE_VIEW_MODULE: Record<string, string | undefined> = {
  "/dashboard": "dashboard",
  "/products": "products",
  "/categories": "categories",
  "/inventory": "inventory",
  "/orders": "orders",
  "/deliveries": "deliveries",
  "/drivers": "deliveries",
  "/invoices": "invoices",
  "/payments": "payments",
  "/reports": "reports",
  "/purchase-orders": "purchaseOrders",
  "/complaints": "complaints",
  "/suppliers": "suppliers",
  "/manufacturers": "manufacturers",
  "/branches": "branches",
  "/users": "users",
  "/roles": "roles",
  "/activity-logs": "activityLogs",
  "/settings": "settings",
  /** Client-side utility; any active user may open (see `can("tools", "view")`). */
  "/curtain-calculator": "tools",
};

const STAFF_NAV_FALLBACK_ORDER = [
  "/dashboard",
  "/products",
  "/orders",
  "/complaints",
  "/deliveries",
  "/purchase-orders",
  "/inventory",
  "/categories",
  "/invoices",
  "/payments",
  "/reports",
  "/suppliers",
  "/manufacturers",
  "/branches",
  "/users",
  "/roles",
  "/activity-logs",
  "/settings",
  "/curtain-calculator",
];

export function usePermissions() {
  const { user } = useAuth();
  return useMemo(() => {
    const matrix = normalizePermissions(user?.role?.permissions as Record<string, PermissionSet> | undefined);
    const superAdmin = user?.role?.name === "Super Admin";

    const partnerPortalMatrix: Record<string, Partial<PermissionSet>> = {
      dashboard: { view: true },
      settings: { view: true },
      purchaseOrders: { view: true, edit: true },
      products: { view: true },
      complaints: { view: true, edit: true },
    };

    const can = (module: string, action: PermissionUiAction): boolean => {
      if (module === "tools" && action === "view") {
        if (user && isPartnerPortalUser(user)) return true;
        if (!user?.roleId || !user.isActive) return false;
        return true;
      }
      if (module === "activityLogs" && action === "view") {
        if (!user?.roleId || !user.isActive) return false;
        if (superAdmin) return true;
        return !!(matrix.activityLogs?.view || matrix.users?.view);
      }
      if (user && isPartnerPortalUser(user)) {
        const row = partnerPortalMatrix[module];
        return !!row?.[action];
      }
      if (!user?.roleId || !user.isActive) return false;
      if (superAdmin) return true;
      return !!matrix[module]?.[action];
    };

    /** First sidebar path user may open (module view); null if none. */
    const firstAccessiblePath = (): string | null => {
      if (user && isPartnerPortalUser(user)) return "/dashboard";
      for (const path of STAFF_NAV_FALLBACK_ORDER) {
        const mod = ROUTE_VIEW_MODULE[path];
        if (mod && can(mod, "view")) return path;
      }
      return null;
    };

    return { matrix, superAdmin, can, firstAccessiblePath };
  }, [user]);
}
