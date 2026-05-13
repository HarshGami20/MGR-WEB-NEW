import { isSuperAdminRole } from "./permissions";

/** Branch ids the user may work in (join table, else legacy `branchId`). Empty = all branches (e.g. Super Admin, unscoped staff). */
export function assignedBranchIds(user: {
  branchId?: number | null;
  userBranches?: { branchId: number }[];
  role?: { name?: string | null } | null;
}): number[] {
  if (isSuperAdminRole(user)) return [];
  const rows = user.userBranches ?? [];
  if (rows.length > 0) {
    return [...new Set(rows.map((r) => r.branchId))].sort((a, b) => a - b);
  }
  if (user.branchId != null) return [user.branchId];
  return [];
}
