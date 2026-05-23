import { isSuperAdminRole } from "./permissions";
import { prisma } from "./prisma";
import { normalizeWhatsAppPhone } from "./whatsapp-phone";
import type { OrderAssigneeRecipient } from "./whatsapp-order-recipients";

async function recipientsFromUserIds(userIds: number[]): Promise<OrderAssigneeRecipient[]> {
  const unique = [...new Set(userIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (unique.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: unique }, isActive: true },
    select: { id: true, name: true, mobile: true },
  });

  const byId = new Map<number, OrderAssigneeRecipient>();
  for (const u of users) {
    const phone = normalizeWhatsAppPhone(u.mobile);
    if (!phone) continue;
    byId.set(u.id, { userId: u.id, name: u.name?.trim() || "Team member", phone });
  }

  return unique.map((id) => byId.get(id)).filter((r): r is OrderAssigneeRecipient => r != null);
}

async function superAdminUserIds(): Promise<number[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true, supplierId: null, manufacturerId: null },
    select: { id: true, role: { select: { name: true } } },
  });
  return users.filter((u) => isSuperAdminRole(u)).map((u) => u.id);
}

/** User who updated stock + all Super Admin users (deduped). */
export async function inventoryUpdateRecipients(
  updatedById?: number | null,
): Promise<OrderAssigneeRecipient[]> {
  const ids = new Set<number>();
  if (updatedById) ids.add(updatedById);
  for (const id of await superAdminUserIds()) ids.add(id);
  return recipientsFromUserIds([...ids]);
}
