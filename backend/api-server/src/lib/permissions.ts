import type { Request, Response, NextFunction } from "express";

export type StdPermission = "read" | "create" | "update" | "delete";

/** UI / OpenAPI permission shape (view, add, edit, delete). */
export interface UiPermissionSet {
  view: boolean;
  add: boolean;
  edit: boolean;
  delete: boolean;
}

/** All modules enforced in roles UI and seed — keep in sync with frontend PERMISSION_MODULES. */
export const PERMISSION_MODULE_KEYS = [
  "dashboard",
  "users",
  "roles",
  "branches",
  "categories",
  "products",
  "inventory",
  "orders",
  "deliveries",
  "invoices",
  "payments",
  "reports",
  "suppliers",
  "manufacturers",
  "purchaseOrders",
  "complaints",
  "settings",
] as const;

export type PermissionModuleKey = (typeof PERMISSION_MODULE_KEYS)[number];

export interface NormalizedModulePerms {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

export function emptyUiPermissionsMatrix(): Record<PermissionModuleKey, UiPermissionSet> {
  const row: UiPermissionSet = { view: false, add: false, edit: false, delete: false };
  return Object.fromEntries(PERMISSION_MODULE_KEYS.map((k) => [k, { ...row }])) as Record<
    PermissionModuleKey,
    UiPermissionSet
  >;
}

/** DB JSON (read/create/update/delete or view/add/edit/delete) → UI matrix for API responses. */
export function normalizePermissionsForUi(raw: unknown): Record<string, UiPermissionSet> {
  const out = emptyUiPermissionsMatrix() as Record<string, UiPermissionSet>;
  if (!raw || typeof raw !== "object") return out;

  for (const [mod, actions] of Object.entries(raw as Record<string, unknown>)) {
    if (!actions || typeof actions !== "object") continue;
    const a = actions as Record<string, unknown>;
    out[mod] = {
      view: !!(a.view ?? a.read),
      add: !!(a.add ?? a.create),
      edit: !!(a.edit ?? a.update),
      delete: !!a.delete,
    };
  }
  return out;
}

/** UI matrix from client → ensure every known module is present before persisting. */
export function ensureFullUiPermissionsMatrix(
  partial: Record<string, UiPermissionSet | undefined> | null | undefined,
): Record<PermissionModuleKey, UiPermissionSet> {
  const base = emptyUiPermissionsMatrix();
  if (!partial || typeof partial !== "object") return base;
  for (const key of PERMISSION_MODULE_KEYS) {
    const slice = partial[key];
    if (!slice || typeof slice !== "object") continue;
    base[key] = {
      view: !!slice.view,
      add: !!slice.add,
      edit: !!slice.edit,
      delete: !!slice.delete,
    };
  }
  return base;
}

/** Accepts Role JSON from DB — supports seed shape (read/create/update/delete) and UI shape (view/add/edit/delete). */
export function normalizeRolePermissions(json: string | null | undefined): Record<string, NormalizedModulePerms> {
  if (!json) return {};
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
  const out: Record<string, NormalizedModulePerms> = {};
  for (const [mod, actions] of Object.entries(raw)) {
    if (!actions || typeof actions !== "object") continue;
    const a = actions as Record<string, unknown>;
    out[mod] = {
      read: !!(a.read ?? a.view),
      create: !!(a.create ?? a.add),
      update: !!(a.update ?? a.edit),
      delete: !!a.delete,
    };
  }
  return out;
}

export function isSuperAdminRole(user: { role?: { name?: string | null } | null }): boolean {
  return user.role?.name === "Super Admin";
}

export function hasStdPermission(
  matrix: Record<string, NormalizedModulePerms>,
  user: unknown,
  module: string,
  action: StdPermission
): boolean {
  const u = user as { isActive?: boolean; role?: { name?: string | null } | null; roleId?: number | null };
  if (!u?.isActive) return false;
  if (isSuperAdminRole(u)) return true;
  if (!u.roleId) return false;
  const row = matrix[module];
  if (!row) return false;
  return !!row[action];
}

/** Products image upload — allowed when user can create or edit products */
export function requireProductsCreateOrUpdate(req: Request, res: Response, next: NextFunction): void {
  const matrix = (req as { permissionMatrix?: Record<string, NormalizedModulePerms> }).permissionMatrix ?? {};
  const user = (req as { user?: unknown }).user;
  const canCreate = hasStdPermission(matrix, user, "products", "create");
  const canUpdate = hasStdPermission(matrix, user, "products", "update");
  if (!canCreate && !canUpdate) {
    res.status(403).json({ error: "Forbidden", message: "Insufficient permission" });
    return;
  }
  next();
}

export function requirePermission(module: string, action: StdPermission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const matrix = (req as { permissionMatrix?: Record<string, NormalizedModulePerms> }).permissionMatrix ?? {};
    const user = (req as { user?: unknown }).user;
    if (!hasStdPermission(matrix, user, module, action)) {
      res.status(403).json({ error: "Forbidden", message: "Insufficient permission" });
      return;
    }
    next();
  };
}

/** Pass if the user satisfies any of the listed module/action pairs (or is Super Admin). */
export function requirePermissionAny(pairs: Array<{ module: string; action: StdPermission }>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const matrix = (req as { permissionMatrix?: Record<string, NormalizedModulePerms> }).permissionMatrix ?? {};
    const user = (req as { user?: unknown }).user;
    if (isSuperAdminRole(user as { role?: { name?: string | null } | null })) {
      next();
      return;
    }
    for (const { module, action } of pairs) {
      if (hasStdPermission(matrix, user, module, action)) {
        next();
        return;
      }
    }
    res.status(403).json({ error: "Forbidden", message: "Insufficient permission" });
  };
}
