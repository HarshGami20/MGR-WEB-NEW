import { prisma } from "./prisma";
import { ensureFullUiPermissionsMatrix, type UiPermissionSet } from "./permissions";

export const SUPPLIER_PORTAL_ROLE_NAME = "Supplier Portal";
export const MANUFACTURER_PORTAL_ROLE_NAME = "Manufacturer Portal";

function portalPermissionsJson(): string {
  const partial: Record<string, UiPermissionSet> = {
    dashboard: { view: true, add: false, edit: false, delete: false },
    purchaseOrders: { view: true, add: false, edit: true, delete: false },
    products: { view: true, add: false, edit: false, delete: false },
    complaints: { view: true, add: false, edit: true, delete: false },
    settings: { view: true, add: false, edit: false, delete: false },
  };
  return JSON.stringify(ensureFullUiPermissionsMatrix(partial));
}

async function ensurePortalRoleId(name: string): Promise<number> {
  const role = await prisma.role.upsert({
    where: { name },
    create: { name, permissions: portalPermissionsJson() },
    update: { permissions: portalPermissionsJson() },
    select: { id: true },
  });
  return role.id;
}

export async function ensureSupplierPortalRoleId(): Promise<number> {
  return ensurePortalRoleId(SUPPLIER_PORTAL_ROLE_NAME);
}

export async function ensureManufacturerPortalRoleId(): Promise<number> {
  return ensurePortalRoleId(MANUFACTURER_PORTAL_ROLE_NAME);
}

/** Ensures portal roles exist in DB (safe to run on every server start). */
export async function ensurePortalRoles(): Promise<void> {
  await Promise.all([ensureSupplierPortalRoleId(), ensureManufacturerPortalRoleId()]);
}
