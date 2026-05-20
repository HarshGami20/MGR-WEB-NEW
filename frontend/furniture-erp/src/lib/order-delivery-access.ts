export type DeliveryAssigneeRef = { id: number };

export function canUpdateOrderDeliveryStatus(
  order: { deliveryAssignees?: DeliveryAssigneeRef[] | null },
  user: { id?: number; role?: { name?: string | null } | null } | null | undefined,
): boolean {
  if (!user?.id) return false;
  if (user.role?.name === "Super Admin") return true;
  return (order.deliveryAssignees ?? []).some((a) => a.id === user.id);
}
