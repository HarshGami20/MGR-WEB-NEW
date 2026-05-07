import type { Request, Response, NextFunction } from "express";

export type StdPermission = "read" | "create" | "update" | "delete";

export interface NormalizedModulePerms {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
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
