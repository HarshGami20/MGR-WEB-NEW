import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type OrdersAssignmentScope = "all" | "assigned_to_me" | "created_by_me";

const SCOPES = new Set<OrdersAssignmentScope>(["all", "assigned_to_me", "created_by_me"]);

export type SalesScopeUser = {
  id?: number;
  isSales?: boolean | null;
  ordersListScope?: string | null;
};

export function normalizeOrdersListScope(value: unknown): OrdersAssignmentScope | null {
  if (typeof value !== "string" || !SCOPES.has(value as OrdersAssignmentScope)) return null;
  return value as OrdersAssignmentScope;
}

export function salesUserFieldsFromBody(body: Record<string, unknown>): {
  isSales: boolean;
  ordersListScope: string | null;
} {
  const isSales = body.isSales === true;
  const scope = normalizeOrdersListScope(body.ordersListScope);
  if (!isSales) return { isSales: false, ordersListScope: null };
  return { isSales: true, ordersListScope: scope ?? "all" };
}

/** Scope applied to order list queries (server-side). Non-sales users always see all orders. */
export function resolveOrdersAssignmentScope(
  user: SalesScopeUser,
  requested?: string | null,
): "created_by_me" | "assigned_to_me" | null {
  if (!user.isSales) return null;
  const configured = normalizeOrdersListScope(user.ordersListScope);
  if (configured === "assigned_to_me" || configured === "created_by_me") {
    return configured;
  }
  if (requested === "created_by_me" || requested === "assigned_to_me") {
    return requested;
  }
  return null;
}

export function assignmentScopeWhere(
  scope: "created_by_me" | "assigned_to_me",
  userId: number,
): Prisma.OrderWhereInput {
  if (scope === "created_by_me") {
    return { createdById: userId };
  }
  return {
    OR: [{ assignedToId: userId }, { assignees: { some: { userId } } }],
  };
}

export async function assertOrderAccessibleBySalesScope(
  orderId: number,
  user: SalesScopeUser & { id: number },
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (!user.isSales) return { ok: true };
  const configured = normalizeOrdersListScope(user.ordersListScope);
  if (!configured || configured === "all") return { ok: true };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      createdById: true,
      assignedToId: true,
      assignees: { select: { userId: true } },
    },
  });
  if (!order) return { ok: false, status: 404, message: "Order not found" };

  const assigneeIds = order.assignees.map((a) => a.userId);
  const allowed =
    configured === "created_by_me"
      ? order.createdById === user.id
      : order.assignedToId === user.id || assigneeIds.includes(user.id);

  if (!allowed) {
    return { ok: false, status: 403, message: "You do not have access to this order" };
  }
  return { ok: true };
}
