import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/** Always included as order assignees on create and update. */
export const ORDER_AUTO_ASSIGNEE_ROLE_NAMES = ["Super Admin", "Admin"] as const;

export async function loadOrderAutoAssigneeUserIds(): Promise<number[]> {
  const rows = await prisma.user.findMany({
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
  return rows.map((r) => r.id);
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