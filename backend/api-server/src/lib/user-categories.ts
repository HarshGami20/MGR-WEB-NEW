import { isSuperAdminRole } from "./permissions";

/** Root category ids assigned to the user. Empty with `allCategories` false = no category scope. */
export function assignedCategoryIds(user: {
  allCategories?: boolean;
  userCategories?: { categoryId: number }[];
  role?: { name?: string | null } | null;
}): number[] {
  if (isSuperAdminRole(user) || user.allCategories) return [];
  const rows = user.userCategories ?? [];
  if (rows.length > 0) {
    return [...new Set(rows.map((r) => r.categoryId))].sort((a, b) => a - b);
  }
  return [];
}

export function userMatchesOrderCategory(
  user: {
    allCategories?: boolean;
    userCategories?: { categoryId: number }[];
    role?: { name?: string | null } | null;
  },
  categoryId: number,
): boolean {
  if (isSuperAdminRole(user) || user.allCategories) return true;
  const ids = assignedCategoryIds(user);
  return ids.includes(categoryId);
}
