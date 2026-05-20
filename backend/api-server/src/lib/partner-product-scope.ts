import type { Request, Response, NextFunction } from "express";
import { prisma } from "./prisma";
import { getPartnerScope, type PartnerScope } from "./partner-scope";
import { hasStdPermission } from "./permissions";

/** Product appears on at least one PO assigned to this supplier or manufacturer. */
export async function partnerCanReadProduct(scope: PartnerScope, productId: number): Promise<boolean> {
  if (!Number.isFinite(productId) || productId <= 0) return false;

  const purchaseOrderWhere =
    scope.kind === "supplier"
      ? { type: "supplier" as const, supplierId: scope.supplierId }
      : { type: "manufacturer" as const, manufacturerId: scope.manufacturerId };

  const line = await prisma.purchaseOrderItem.findFirst({
    where: {
      productId,
      purchaseOrder: purchaseOrderWhere,
    },
    select: { id: true },
  });
  return line != null;
}

function productIdFromRequest(req: Request): number | null {
  const raw = req.params.id ?? req.params.productId;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (s == null || s === "") return null;
  const id = parseInt(String(s), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Staff: normal products read permission.
 * Supplier / manufacturer portal: read only products on their purchase orders (by product id in URL).
 */
export function requireProductReadAccess() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as { user?: unknown }).user;
    const matrix = (req as { permissionMatrix?: Record<string, unknown> }).permissionMatrix ?? {};

    const scope = await getPartnerScope(req);
    if (scope) {
      const productId = productIdFromRequest(req);
      if (productId == null) {
        res.status(403).json({
          error: "Forbidden",
          message: "Portal users can only open products linked to their purchase orders",
        });
        return;
      }
      if (await partnerCanReadProduct(scope, productId)) {
        next();
        return;
      }
      res.status(403).json({
        error: "Forbidden",
        message: "This product is not on any purchase order assigned to your account",
      });
      return;
    }

    if (!hasStdPermission(matrix as Parameters<typeof hasStdPermission>[0], user, "products", "read")) {
      res.status(403).json({ error: "Forbidden", message: "Insufficient permission" });
      return;
    }
    next();
  };
}
