import type { PurchaseOrder } from "@prisma/client";
import type { Request } from "express";
import { prisma } from "./prisma";

/** Logged-in user linked to supplier or manufacturer (portal-only access). */
export type PartnerScope =
  | { kind: "supplier"; supplierId: number }
  | { kind: "manufacturer"; manufacturerId: number };

export async function getPartnerScope(req: Request): Promise<PartnerScope | undefined> {
  const uid = (req as { user?: { id?: number } }).user?.id;
  if (uid === undefined || uid === null) return undefined;
  const row = await prisma.user.findUnique({
    where: { id: uid },
    select: { supplierId: true, manufacturerId: true },
  });
  if (row?.supplierId) return { kind: "supplier", supplierId: row.supplierId };
  if (row?.manufacturerId) return { kind: "manufacturer", manufacturerId: row.manufacturerId };
  return undefined;
}

export function purchaseOrderMatchesScope(
  po: Pick<PurchaseOrder, "type" | "supplierId" | "manufacturerId">,
  scope: PartnerScope | undefined
): boolean {
  if (!scope) return true;
  if (scope.kind === "supplier") {
    return po.type === "supplier" && po.supplierId === scope.supplierId;
  }
  return po.type === "manufacturer" && po.manufacturerId === scope.manufacturerId;
}

/** Statuses HQ uses when creating/updating workflow; portal users progress POs forward only. */
export const PARTNER_ALLOWED_PO_STATUSES = new Set(["confirmed", "in_production", "shipped", "delivered"]);
