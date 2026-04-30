import { prisma } from "./prisma";

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
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return null;
  const supplier = u.supplierId ? await slimSupplier(u.supplierId) : null;
  const manufacturer = u.manufacturerId ? await slimManufacturer(u.manufacturerId) : null;
  const { passwordHash: _omit, ...rest } = u;
  return { ...rest, supplier, manufacturer };
}
