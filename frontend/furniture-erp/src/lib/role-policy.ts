import type { User } from "@/api-client";
import { isSuperAdminUser } from "@/lib/branch-context";
import { isPartnerPortalUser } from "@/lib/partner";

/** System roles — created by supplier/manufacturer flows, not staff user management. */
export const SUPPLIER_PORTAL_ROLE_NAME = "Supplier Portal";
export const MANUFACTURER_PORTAL_ROLE_NAME = "Manufacturer Portal";
export const SUPER_ADMIN_ROLE_NAME = "Super Admin";

export function isPortalSystemRoleName(name: string | null | undefined): boolean {
  const n = name?.trim().toLowerCase() ?? "";
  return (
    n === SUPPLIER_PORTAL_ROLE_NAME.toLowerCase() ||
    n === MANUFACTURER_PORTAL_ROLE_NAME.toLowerCase()
  );
}

export function isPortalSystemRole(role: { name?: string | null } | null | undefined): boolean {
  return isPortalSystemRoleName(role?.name);
}

/** ERP staff user — not a supplier/manufacturer portal login. */
export function isStaffErpUser(user: User | null | undefined): boolean {
  return !isPartnerPortalUser(user);
}

export function filterStaffErpUsers(users: User[]): User[] {
  return users.filter(isStaffErpUser);
}

/**
 * Roles that may be assigned when creating/editing staff users.
 * Excludes portal system roles and Super Admin (unless actor is super admin).
 */
export function filterStaffAssignableRoles(
  roles: { id: number; name: string }[],
  actor?: User | null,
): { id: number; name: string }[] {
  return roles.filter((r) => {
    if (isPortalSystemRole(r)) return false;
    if (
      r.name?.trim().toLowerCase() === SUPER_ADMIN_ROLE_NAME.toLowerCase() &&
      !isSuperAdminUser(actor)
    ) {
      return false;
    }
    return true;
  });
}

/** Custom roles shown in the Roles tab (portal system roles are managed elsewhere). */
export function filterStaffManageableRoles(
  roles: { id: number; name: string }[],
): { id: number; name: string }[] {
  return roles.filter((r) => !isPortalSystemRole(r));
}
