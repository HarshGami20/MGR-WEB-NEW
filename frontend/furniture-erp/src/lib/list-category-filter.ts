import type { CategoryRoot } from "@/components/category-picker-with-manage";

export function categoryIdToParam(categoryId: number | undefined): { categoryId?: number } {
  return categoryId != null ? { categoryId } : {};
}

/** Label shown on the filter trigger for the current selection. */
export function categoryFilterDisplayLabel(
  categoryId: number | undefined,
  roots: CategoryRoot[],
): string {
  if (categoryId == null) return "All categories";
  for (const root of roots) {
    if (root.id === categoryId) return root.name;
    for (const child of root.children ?? []) {
      if (child.id === categoryId) return `${root.name} › ${child.name}`;
    }
  }
  return "Category";
}
