import { prisma } from "./prisma";

export type CategoryInput = { name: string; parentId: number | null };

export function parseCategoryBody(body: unknown): CategoryInput {
  const raw = body as { name?: unknown; parentId?: unknown };
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) throw new Error("Category name is required");

  let parentId: number | null = null;
  if (raw.parentId != null && raw.parentId !== "" && raw.parentId !== 0) {
    const pid = typeof raw.parentId === "number" ? raw.parentId : parseInt(String(raw.parentId), 10);
    if (!Number.isFinite(pid) || pid <= 0) throw new Error("Invalid parent category");
    parentId = pid;
  }

  return { name, parentId };
}

/** Only top-level categories may be parents (two-level tree). */
export async function assertValidCategoryParent(parentId: number | null, excludeId?: number): Promise<void> {
  if (parentId == null) return;

  if (excludeId != null && parentId === excludeId) {
    throw new Error("A category cannot be its own parent");
  }

  const parent = await prisma.category.findUnique({ where: { id: parentId } });
  if (!parent) throw new Error("Parent category not found");
  if (parent.parentId != null) {
    throw new Error("Choose a top-level category as parent (only one subcategory level is supported)");
  }
}

export async function assertUniqueCategoryName(
  name: string,
  parentId: number | null,
  excludeId?: number,
): Promise<void> {
  const existing = await prisma.category.findFirst({
    where: {
      parentId,
      ...(excludeId != null ? { id: { not: excludeId } } : {}),
      name: { equals: name, mode: "insensitive" },
    },
  });
  if (existing) {
    throw new Error(
      parentId == null
        ? "A top-level category with this name already exists"
        : "A subcategory with this name already exists under this parent",
    );
  }
}

export async function assertCategoryCanUpdate(id: number, parentId: number | null): Promise<void> {
  const childCount = await prisma.category.count({ where: { parentId: id } });
  if (childCount > 0 && parentId != null) {
    throw new Error("Remove or reassign subcategories before making this a subcategory");
  }
}

export async function assertCategoryCanDelete(id: number): Promise<void> {
  const [childCount, productCount] = await Promise.all([
    prisma.category.count({ where: { parentId: id } }),
    prisma.product.count({ where: { categoryId: id } }),
  ]);
  if (childCount > 0) {
    throw new Error(`Delete ${childCount} subcategor${childCount === 1 ? "y" : "ies"} first`);
  }
  if (productCount > 0) {
    throw new Error(`This category is used by ${productCount} product${productCount === 1 ? "" : "s"}`);
  }
}

export function buildCategoryTree(all: { id: number; name: string; parentId: number | null; createdAt: Date }[]) {
  return all
    .filter((c) => c.parentId == null)
    .map((c) => ({
      ...c,
      children: all.filter((sub) => sub.parentId === c.id),
    }));
}
