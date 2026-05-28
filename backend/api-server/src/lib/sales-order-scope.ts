import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type OrdersAssignmentScope = "all" | "assigned_to_me" | "created_by_me" | "own";

const SCOPES = new Set<OrdersAssignmentScope>(["all", "assigned_to_me", "created_by_me", "own"]);

export type SalesScopeUser = {
  id?: number;
  isSales?: boolean | null;
  ordersListScope?: string | null;
};

export function normalizeOrdersListScope(value: unknown): OrdersAssignmentScope | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (v === "assigned_to_me" || v === "created_by_me") return "own";
  if (SCOPES.has(v as OrdersAssignmentScope)) return v as OrdersAssignmentScope;
  return null;
}

export function salesUserFieldsFromBody(body: Record<string, unknown>): {
  isSales: boolean;
  ordersListScope: string | null;
} {
  const isSales = body.isSales === true;
  if (!isSales) return { isSales: false, ordersListScope: null };
  const scope = normalizeOrdersListScope(body.ordersListScope);
  return { isSales: true, ordersListScope: scope === "all" ? "all" : "own" };
}

export type EffectiveAssignmentScope = "created_by_me" | "assigned_to_me" | "own";

/** Scope applied to order list queries (server-side). Non-sales users always see all orders. */
export function resolveOrdersAssignmentScope(
  user: SalesScopeUser,
  requested?: string | null,
): EffectiveAssignmentScope | null {
  if (!user.isSales) return null;
  const configured = normalizeOrdersListScope(user.ordersListScope);
  if (configured === "own") return "own";
  if (configured === "assigned_to_me" || configured === "created_by_me") {
    return configured;
  }
  if (configured === "all") {
    const req = typeof requested === "string" ? requested.trim() : "";
    if (req === "created_by_me" || req === "assigned_to_me") return req;
    return null;
  }
  return "own";
}

export function assignmentScopeWhere(
  scope: EffectiveAssignmentScope,
  userId: number,
): Prisma.OrderWhereInput {
  if (scope === "created_by_me") {
    return { createdById: userId };
  }
  if (scope === "assigned_to_me") {
    return {
      OR: [{ assignedToId: userId }, { assignees: { some: { userId } } }],
    };
  }
  return {
    OR: [
      { createdById: userId },
      { assignedToId: userId },
      { assignees: { some: { userId } } },
    ],
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
  const isCreator = order.createdById === user.id;
  const isAssignee = order.assignedToId === user.id || assigneeIds.includes(user.id);

  const allowed =
    configured === "created_by_me"
      ? isCreator
      : configured === "assigned_to_me"
        ? isAssignee
        : isCreator || isAssignee;

  if (!allowed) {
    return { ok: false, status: 403, message: "You do not have access to this order" };
  }
  return { ok: true };
}
