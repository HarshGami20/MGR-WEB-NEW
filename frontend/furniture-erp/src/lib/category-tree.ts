import type { CategoryRoot } from "@/components/category-picker-with-manage";

export type FlatCategoryRow = {
  id: number;
  name: string;
  parentId: number | null;
  level: number;
  parentName: string | null;
  childCount: number;
};

export function flattenCategoryTree(categories: CategoryRoot[] = [], level = 0, parentName: string | null = null): FlatCategoryRow[] {
  const result: FlatCategoryRow[] = [];
  for (const cat of categories) {
    const children = cat.children ?? [];
    result.push({
      id: cat.id,
      name: cat.name,
      parentId: null,
      level,
      parentName,
      childCount: children.length,
    });
    if (children.length > 0) {
      for (const sub of children) {
        result.push({
          id: sub.id,
          name: sub.name,
          parentId: cat.id,
          level: level + 1,
          parentName: cat.name,
          childCount: 0,
        });
      }
    }
  }
  return result;
}

export function rootCategoriesOnly(roots: CategoryRoot[], excludeId?: number | null): CategoryRoot[] {
  return roots.filter((r) => r.id !== excludeId);
}
