import type { User } from "@/api-client";

export function isPartnerPortalUser(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.supplierId != null || user.manufacturerId != null;
}

export function partnerPortalLabel(user: User): string {
  if (user.supplierId && user.supplier?.name) return user.supplier.name;
  if (user.manufacturerId && user.manufacturer?.name) return user.manufacturer.name;
  if (user.supplierId) return "Supplier account";
  if (user.manufacturerId) return "Manufacturer account";
  return "Partner";
}
