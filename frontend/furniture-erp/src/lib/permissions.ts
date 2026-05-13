import { useMemo } from "react";
import type { PermissionSet } from "@/api-client";
import { useAuth } from "@/lib/auth";
import { isPartnerPortalUser } from "@/lib/partner";

export type PermissionUiAction = keyof PermissionSet;

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
  "/invoices": "invoices",
  "/payments": "payments",
  "/reports": "reports",
  "/purchase-orders": "purchaseOrders",
  "/suppliers": "suppliers",
  "/manufacturers": "manufacturers",
  "/branches": "branches",
  "/users": "users",
  "/roles": "roles",
  "/settings": "settings",
  /** Client-side utility; any active user may open (see `can("tools", "view")`). */
  "/curtain-calculator": "tools",
};

const STAFF_NAV_FALLBACK_ORDER = [
  "/dashboard",
  "/products",
  "/orders",
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
    };

    const can = (module: string, action: PermissionUiAction): boolean => {
      if (module === "tools" && action === "view") {
        if (user && isPartnerPortalUser(user)) return true;
        if (!user?.roleId || !user.isActive) return false;
        return true;
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
