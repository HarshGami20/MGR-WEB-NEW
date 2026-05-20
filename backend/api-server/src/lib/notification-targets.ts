import type { PermissionModuleKey } from "./permissions";
import { hasStdPermission, isSuperAdminRole, normalizeRolePermissions } from "./permissions";
import { prisma } from "./prisma";

function userBranchIds(user: {
  branchId: number | null;
  role?: { name?: string | null } | null;
  userBranches: { branchId: number }[];
}): number[] {
  if (isSuperAdminRole(user)) {
    return [];
  }
  const fromJoin = user.userBranches.map((x) => x.branchId);
  if (fromJoin.length > 0) return [...new Set(fromJoin)];
  return user.branchId != null ? [user.branchId] : [];
}

export function userCanAccessBranch(
  user: {
    branchId: number | null;
    role?: { name?: string | null } | null;
    userBranches: { branchId: number }[];
  },
  branchId: number,
): boolean {
  if (isSuperAdminRole(user)) return true;
  const ids = userBranchIds(user);
  return ids.includes(branchId);
}

/** Order assignees, legacy assignedTo, and creator. */
export async function orderNotificationTargets(orderId: number): Promise<number[]> {
  const targets = new Set<number>();
  const [assignees, order] = await Promise.all([
    prisma.orderAssignee.findMany({ where: { orderId }, select: { userId: true } }),
    prisma.order.findUnique({
      where: { id: orderId },
      select: { assignedToId: true, createdById: true },
    }),
  ]);
  for (const r of assignees) targets.add(r.userId);
  if (assignees.length === 0 && order?.assignedToId) targets.add(order.assignedToId);
  if (order?.createdById) targets.add(order.createdById);
  return [...targets];
}

export async function partnerUserIdsForSupplier(supplierId: number): Promise<number[]> {
  const rows = await prisma.user.findMany({
    where: { isActive: true, supplierId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function partnerUserIdsForManufacturer(manufacturerId: number): Promise<number[]> {
  const rows = await prisma.user.findMany({
    where: { isActive: true, manufacturerId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Internal staff with read access on a module, optionally scoped to a branch. */
export async function usersWithModuleRead(
  module: PermissionModuleKey,
  branchId?: number | null,
): Promise<number[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true, supplierId: null, manufacturerId: null },
    select: {
      id: true,
      branchId: true,
      role: { select: { name: true, permissions: true } },
      userBranches: { select: { branchId: true } },
    },
  });
  const targets = new Set<number>();
  for (const u of users) {
    const matrix = normalizeRolePermissions(u.role?.permissions);
    if (!hasStdPermission(matrix, u, module, "read")) continue;
    if (branchId != null && !userCanAccessBranch(u, branchId)) continue;
    targets.add(u.id);
  }
  return [...targets];
}

export async function complaintNotificationTargets(input: {
  kind: "sales_order" | "purchase_order";
  orderId: number | null;
  purchaseOrderId: number | null;
  branchId: number | null;
  createdById: number | null;
}): Promise<number[]> {
  const targets = new Set<number>();
  if (input.createdById) targets.add(input.createdById);

  if (input.kind === "sales_order" && input.orderId) {
    for (const id of await orderNotificationTargets(input.orderId)) targets.add(id);
  }

  if (input.kind === "purchase_order" && input.purchaseOrderId) {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: input.purchaseOrderId },
      select: { branchId: true, supplierId: true, manufacturerId: true, type: true },
    });
    if (po) {
      for (const id of await purchaseOrderStaffTargets(po.branchId)) targets.add(id);
      for (const id of await purchaseOrderPartnerTargets(po)) targets.add(id);
    }
  }

  const staff = await usersWithModuleRead("complaints", input.branchId);
  for (const id of staff) targets.add(id);
  return [...targets];
}

/** Supplier or manufacturer portal users linked to this PO. */
export async function purchaseOrderPartnerTargets(po: {
  supplierId: number | null;
  manufacturerId: number | null;
  type: string;
}): Promise<number[]> {
  const targets = new Set<number>();
  if (po.type === "supplier" && po.supplierId) {
    for (const id of await partnerUserIdsForSupplier(po.supplierId)) targets.add(id);
  }
  if (po.type === "manufacturer" && po.manufacturerId) {
    for (const id of await partnerUserIdsForManufacturer(po.manufacturerId)) targets.add(id);
  }
  return [...targets];
}

/** Internal staff with purchase order access (branch-scoped). */
export async function purchaseOrderStaffTargets(branchId: number | null): Promise<number[]> {
  return usersWithModuleRead("purchaseOrders", branchId);
}

/** Partners + staff — use when HQ changes a PO so both sides stay informed. */
export async function purchaseOrderNotificationTargets(po: {
  branchId: number | null;
  supplierId: number | null;
  manufacturerId: number | null;
  type: string;
}): Promise<number[]> {
  const targets = new Set<number>();
  for (const id of await purchaseOrderStaffTargets(po.branchId)) targets.add(id);
  for (const id of await purchaseOrderPartnerTargets(po)) targets.add(id);
  return [...targets];
}

export function purchaseOrderPartnerLabel(type: string): string {
  return type === "manufacturer" ? "Manufacturer" : "Supplier";
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Avoid duplicate daily reminder pushes for the same entity. */
export async function reminderAlreadySentToday(
  notificationType: string,
  dedupeKey: string,
): Promise<boolean> {
  const start = startOfUtcDay(new Date());
  const row = await prisma.notification.findFirst({
    where: {
      notificationType,
      createdAt: { gte: start },
      metadata: { path: ["dedupeKey"], equals: dedupeKey },
    },
    select: { id: true },
  });
  return row != null;
}
