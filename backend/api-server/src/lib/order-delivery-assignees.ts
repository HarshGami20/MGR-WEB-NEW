import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { isSuperAdminRole } from "./permissions";

export type DeliveryAssigneeUser = { id: number; name: string; mobile: string };

export async function replaceOrderDeliveryAssignees(
  tx: Prisma.TransactionClient,
  orderId: number,
  userIds: number[],
): Promise<void> {
  const unique = [...new Set(userIds.filter((n) => Number.isFinite(n) && n > 0))];
  await tx.orderDeliveryAssignee.deleteMany({ where: { orderId } });
  if (unique.length > 0) {
    await tx.orderDeliveryAssignee.createMany({
      data: unique.map((userId) => ({ orderId, userId })),
    });
  }
}

export async function loadDeliveryAssigneesForOrder(orderId: number): Promise<DeliveryAssigneeUser[]> {
  const rows = await prisma.orderDeliveryAssignee.findMany({
    where: { orderId },
    include: { user: { select: { id: true, name: true, mobile: true } } },
    orderBy: [{ userId: "asc" }],
  });
  return rows
    .map((r) => r.user)
    .filter((u): u is DeliveryAssigneeUser => u != null);
}

export async function assertCanUpdateOrderDeliveryStatus(
  user: { id: number; role?: { name?: string | null } | null },
  orderId: number,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (isSuperAdminRole(user)) return { ok: true };
  const link = await prisma.orderDeliveryAssignee.findFirst({
    where: { orderId, userId: user.id },
    select: { orderId: true },
  });
  if (link) return { ok: true };
  return {
    ok: false,
    status: 403,
    message: "Only delivery assignees or Super Admin can update delivery status",
  };
}
