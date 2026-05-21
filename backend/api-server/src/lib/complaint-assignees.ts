import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { isSuperAdminRole } from "./permissions";

export type ComplaintAssigneeUser = { id: number; name: string; mobile: string };

export async function replaceComplaintAssignees(
  tx: Prisma.TransactionClient,
  complaintId: number,
  userIds: number[],
): Promise<void> {
  const unique = [...new Set(userIds.filter((n) => Number.isFinite(n) && n > 0))];
  await tx.complaintAssignee.deleteMany({ where: { complaintId } });
  if (unique.length > 0) {
    await tx.complaintAssignee.createMany({
      data: unique.map((userId) => ({ complaintId, userId })),
    });
  }
}

export async function loadComplaintAssignees(complaintId: number): Promise<ComplaintAssigneeUser[]> {
  const rows = await prisma.complaintAssignee.findMany({
    where: { complaintId },
    include: { user: { select: { id: true, name: true, mobile: true } } },
    orderBy: [{ userId: "asc" }],
  });
  return rows.map((r) => r.user).filter((u): u is ComplaintAssigneeUser => u != null);
}

export async function assertCanUpdateComplaintStatus(
  user: { id: number; role?: { name?: string | null } | null },
  complaintId: number,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (isSuperAdminRole(user)) return { ok: true };
  const link = await prisma.complaintAssignee.findFirst({
    where: { complaintId, userId: user.id },
    select: { complaintId: true },
  });
  if (link) return { ok: true };
  return {
    ok: false,
    status: 403,
    message: "Only complaint assignees or Super Admin can update complaint status",
  };
}

export async function assertActiveUserIdsExist(userIds: number[]): Promise<void> {
  if (userIds.length === 0) return;
  const found = await prisma.user.count({ where: { id: { in: userIds }, isActive: true } });
  if (found !== userIds.length) {
    throw new Error("One or more assignees are invalid or inactive");
  }
}

export function normalizeAssigneeUserIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
}
