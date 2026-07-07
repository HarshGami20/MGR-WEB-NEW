import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/** Always included as order assignees on create and update. */
export const ORDER_AUTO_ASSIGNEE_ROLE_NAMES = ["Super Admin", "Admin"] as const;

function userBranchScopeWhere(branchId: number): Prisma.UserWhereInput {
  return {
    OR: [
      { role: { name: { equals: "Super Admin", mode: "insensitive" } } },
      { userBranches: { some: { branchId } } },
      {
        AND: [{ userBranches: { none: {} } }, { branchId }],
      },
      {
        AND: [{ userBranches: { none: {} } }, { branchId: null }],
      },
    ],
  };
}

export async function loadOrderAutoAssigneeUserIds(opts?: {
  categoryId?: number | null;
  branchId?: number | null;
}): Promise<number[]> {
  const categoryId =
    opts?.categoryId != null && Number.isFinite(opts.categoryId) && opts.categoryId > 0
      ? opts.categoryId
      : null;
  const branchId =
    opts?.branchId != null && Number.isFinite(opts.branchId) && opts.branchId > 0
      ? opts.branchId
      : null;

  const adminRows = await prisma.user.findMany({
    where: {
      isActive: true,
      role: {
        OR: ORDER_AUTO_ASSIGNEE_ROLE_NAMES.map((name) => ({
          name: { equals: name, mode: "insensitive" },
        })),
      },
    },
    select: { id: true },
    orderBy: [{ id: "asc" }],
  });

  let categoryRows: { id: number }[] = [];
  if (categoryId != null) {
    const where: Prisma.UserWhereInput = {
      isActive: true,
      OR: [{ allCategories: true }, { userCategories: { some: { categoryId } } }],
      ...(branchId != null ? { AND: [userBranchScopeWhere(branchId)] } : {}),
    };
    categoryRows = await prisma.user.findMany({
      where,
      select: { id: true },
      orderBy: [{ id: "asc" }],
    });
  }

  const merged: number[] = [];
  const seen = new Set<number>();
  for (const row of [...adminRows, ...categoryRows]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row.id);
  }
  return merged;
}

/** Auto-assignees first, then user-selected ids (deduped). */
export function mergeOrderAssigneeUserIds(selectedIds: number[], autoIds: number[]): number[] {
  const merged: number[] = [];
  const seen = new Set<number>();
  for (const id of [...autoIds, ...selectedIds]) {
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

export async function loadOrderAssigneeUserIdsTx(
  tx: Prisma.TransactionClient,
  orderId: number,
): Promise<number[]> {
  const rows = await tx.orderAssignee.findMany({
    where: { orderId },
    select: { userId: true },
    orderBy: [{ userId: "asc" }],
  });
  return rows.map((r) => r.userId);
}
