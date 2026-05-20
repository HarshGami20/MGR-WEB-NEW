import type { Complaint, Prisma } from "@prisma/client";
import type { Request } from "express";
import { assignedBranchIds } from "./user-branches";
import { getPartnerScope, purchaseOrderMatchesScope, type PartnerScope } from "./partner-scope";
import { prisma } from "./prisma";

export function partnerComplaintWhere(scope: PartnerScope): Prisma.ComplaintWhereInput {
  return {
    kind: "purchase_order",
    purchaseOrder:
      scope.kind === "supplier"
        ? { supplierId: scope.supplierId, type: "supplier" }
        : { manufacturerId: scope.manufacturerId, type: "manufacturer" },
  };
}

export function branchFilterForUser(user: {
  branchId?: number | null;
  userBranches?: { branchId: number }[];
}): Prisma.ComplaintWhereInput | null {
  const assigned = assignedBranchIds(user);
  if (assigned.length === 0) return null;
  return { branchId: { in: assigned } };
}

export async function assertComplaintReadAccess(
  req: Request,
  complaint: Pick<Complaint, "kind" | "branchId" | "purchaseOrderId">,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const scope = await getPartnerScope(req);
  if (scope) {
    if (complaint.kind !== "purchase_order" || complaint.purchaseOrderId == null) {
      return { ok: false, status: 403, message: "Complaint is outside your portal access" };
    }
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: complaint.purchaseOrderId },
      select: { type: true, supplierId: true, manufacturerId: true },
    });
    if (!po || !purchaseOrderMatchesScope(po, scope)) {
      return { ok: false, status: 403, message: "Complaint is outside your portal access" };
    }
    return { ok: true };
  }

  const user = (req as { user?: { branchId: number | null; userBranches?: { branchId: number }[] } }).user;
  if (user && complaint.branchId != null) {
    const branchScope = branchFilterForUser(user);
    if (branchScope) {
      const allowed = assignedBranchIds(user);
      if (!allowed.includes(complaint.branchId)) {
        return { ok: false, status: 403, message: "Complaint is outside your branch access" };
      }
    }
  }
  return { ok: true };
}
