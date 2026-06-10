import type { Request, Response } from "express";
import { hasStdPermission, type NormalizedModulePerms } from "./permissions";
import { assertOrderAccessibleBySalesScope, type SalesScopeUser } from "./sales-order-scope";

type AuthUser = SalesScopeUser & { id: number; isActive?: boolean; roleId?: number | null };

/** Payments module read, or orders read scoped to a specific order the user may access. */
export async function assertCanReadOrderPayments(
  req: Request,
  res: Response,
  orderId: number,
): Promise<boolean> {
  if (!Number.isFinite(orderId) || orderId <= 0) {
    res.status(400).json({ error: "Invalid order id" });
    return false;
  }

  const matrix =
    (req as { permissionMatrix?: Record<string, NormalizedModulePerms> }).permissionMatrix ?? {};
  const user = (req as { user?: AuthUser }).user;

  if (hasStdPermission(matrix, user, "payments", "read")) return true;

  if (!hasStdPermission(matrix, user, "orders", "read")) {
    res.status(403).json({ error: "Forbidden", message: "Insufficient permission" });
    return false;
  }

  if (!user?.id) {
    res.status(403).json({ error: "Forbidden", message: "Insufficient permission" });
    return false;
  }

  const access = await assertOrderAccessibleBySalesScope(orderId, user);
  if (!access.ok) {
    res.status(access.status).json({ error: access.message });
    return false;
  }

  return true;
}
