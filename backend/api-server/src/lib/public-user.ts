import { prisma } from "./prisma";
import { isSuperAdminRole } from "./permissions";
import { assignedCategoryIds } from "./user-categories";

async function slimSupplier(id: number) {
  const s = await prisma.supplier.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  return s ?? null;
}

async function slimManufacturer(id: number) {
  const m = await prisma.manufacturer.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  return m ?? null;
}

export async function loadUserPublicById(userId: number) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: { select: { name: true } },
      userBranches: {
        include: { branch: true },
      },
      userCategories: {
        include: { category: true },
      },
    },
  });
  if (!u) return null;
  const supplier = u.supplierId ? await slimSupplier(u.supplierId) : null;
  const manufacturer = u.manufacturerId ? await slimManufacturer(u.manufacturerId) : null;
  const { passwordHash: _omit, userBranches, userCategories, ...rest } = u;
  if (isSuperAdminRole(u)) {
    return {
      ...rest,
      branchId: null,
      branch: null,
      branchIds: [],
      branches: [],
      allCategories: true,
      categoryIds: [],
      categories: [],
      supplier,
      manufacturer,
    };
  }
  const ubRows = userBranches ?? [];
  /** Prefer join-table ids so multi-branch works even if a `branch` include is missing. */
  const branchIdsFromJoin = [...new Set(ubRows.map((ub) => ub.branchId))]
    .filter((id) => Number.isFinite(id))
    .sort((a, b) => a - b);
  let branchIds = branchIdsFromJoin;
  if (branchIds.length === 0 && u.branchId != null && Number.isFinite(u.branchId)) {
    branchIds = [u.branchId];
  }
  const branchesForDisplay = ubRows.map((ub) => ub.branch).filter((b): b is NonNullable<typeof b> => !!b);
  const branch = branchIds.length === 1 ? branchesForDisplay.find((b) => b.id === branchIds[0]) ?? null : null;
  const branchId = branchIds.length === 1 ? branchIds[0]! : null;
  const ucRows = userCategories ?? [];
  const categoryIdsFromJoin = assignedCategoryIds({
    allCategories: u.allCategories,
    userCategories: ucRows,
    role: u.role,
  });
  const categoriesForDisplay = ucRows.map((uc) => uc.category).filter((c): c is NonNullable<typeof c> => !!c);
  return {
    ...rest,
    branchId,
    branch,
    branchIds,
    branches: branchesForDisplay,
    allCategories: Boolean(u.allCategories),
    categoryIds: categoryIdsFromJoin,
    categories: categoriesForDisplay,
    supplier,
    manufacturer,
  };
}
