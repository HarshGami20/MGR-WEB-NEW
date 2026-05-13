import { prisma } from "./prisma";
import { isSuperAdminRole } from "./permissions";

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
    },
  });
  if (!u) return null;
  const supplier = u.supplierId ? await slimSupplier(u.supplierId) : null;
  const manufacturer = u.manufacturerId ? await slimManufacturer(u.manufacturerId) : null;
  const { passwordHash: _omit, userBranches, ...rest } = u;
  if (isSuperAdminRole(u)) {
    return {
      ...rest,
      branchId: null,
      branch: null,
      branchIds: [],
      branches: [],
      supplier,
      manufacturer,
    };
  }
  const branches = (userBranches ?? []).map((ub) => ub.branch).filter(Boolean);
  const branchIds = branches.map((b) => b.id);
  const branch = branches.length === 1 ? branches[0] ?? null : null;
  const branchId = branches.length === 1 ? branches[0]?.id ?? null : null;
  return { ...rest, branchId, branch, branchIds, branches, supplier, manufacturer };
}
