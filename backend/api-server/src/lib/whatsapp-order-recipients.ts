import { normalizeWhatsAppPhone } from "./whatsapp-phone";
import { prisma } from "./prisma";

export type OrderAssigneeRecipient = {
  userId: number;
  name: string;
  phone: string;
};

/** Active assignee user IDs (junction table + legacy assignedTo). */
export async function orderAssigneeUserIds(orderId: number): Promise<number[]> {
  const assignees = await prisma.orderAssignee.findMany({
    where: { orderId },
    select: { userId: true },
  });
  const ids = assignees.map((r) => r.userId);
  if (ids.length === 0) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { assignedToId: true },
    });
    if (order?.assignedToId) ids.push(order.assignedToId);
  }
  return [...new Set(ids)];
}

/** Assignees with display name and WhatsApp-ready phone (one row per user). */
export async function orderAssigneeRecipients(orderId: number): Promise<OrderAssigneeRecipient[]> {
  const userIds = await orderAssigneeUserIds(orderId);
  if (userIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, isActive: true },
    select: { id: true, name: true, mobile: true },
  });

  const byUserId = new Map<number, OrderAssigneeRecipient>();
  for (const u of users) {
    const phone = normalizeWhatsAppPhone(u.mobile);
    if (!phone) continue;
    const name = u.name?.trim() || "Team member";
    byUserId.set(u.id, { userId: u.id, name, phone });
  }

  return userIds
    .map((id) => byUserId.get(id))
    .filter((r): r is OrderAssigneeRecipient => r != null);
}

/** Distinct WhatsApp-ready phones for order assignees. */
export async function orderAssigneePhones(orderId: number): Promise<string[]> {
  const recipients = await orderAssigneeRecipients(orderId);
  return [...new Set(recipients.map((r) => r.phone))];
}
