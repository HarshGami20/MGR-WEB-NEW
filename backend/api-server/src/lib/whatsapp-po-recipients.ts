import { purchaseOrderPartnerTargets } from "./notification-targets";
import { normalizeWhatsAppPhone } from "./whatsapp-phone";
import { prisma } from "./prisma";
import type { OrderAssigneeRecipient } from "./whatsapp-order-recipients";

export type PoRef = {
  supplierId: number | null;
  manufacturerId: number | null;
  type: string;
};

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

/** PO created + status: supplier/manufacturer portal users and PO creator. */
export async function purchaseOrderPartnerAndCreatorRecipients(
  po: PoRef & { createdById?: number | null },
): Promise<OrderAssigneeRecipient[]> {
  const ids = new Set<number>();
  for (const id of await purchaseOrderPartnerTargets(po)) ids.add(id);
  if (po.createdById) ids.add(po.createdById);
  return recipientsFromUserIds([...ids]);
}

/** PO updated: notify only the user who created the PO. */
export async function purchaseOrderCreatorRecipients(
  createdById?: number | null,
): Promise<OrderAssigneeRecipient[]> {
  if (!createdById) return [];
  return recipientsFromUserIds([createdById]);
}
