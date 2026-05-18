import { jsonToAttrs } from "@/pages/products-shared";

export type PartnerLineSpec = {
  size?: string;
  colour?: string;
  fabric?: string;
  variantName?: string;
  extras: { key: string; value: string }[];
};

function pickAttr(attrs: { key: string; value: string }[], keys: string[]): string | undefined {
  for (const want of keys) {
    const hit = attrs.find((a) => a.key.trim().toLowerCase() === want.toLowerCase());
    if (hit?.value?.trim()) return hit.value.trim();
  }
  return undefined;
}

/** Extract size / colour / fabric from variant attributes JSON for partner PO lines. */
export function partnerLineSpecFromAttributes(
  attributesJson: string | null | undefined,
  variantName?: string | null,
): PartnerLineSpec {
  const attrs = jsonToAttrs(attributesJson ?? null);
  const usedKeys = new Set(["size", "colour", "color", "fabric", "material"]);
  const size = pickAttr(attrs, ["size", "Size", "dimensions", "Dimensions"]);
  const colour = pickAttr(attrs, ["colour", "color", "Colour", "Color"]);
  const fabric = pickAttr(attrs, ["fabric", "Fabric", "material", "Material", "upholstery", "Upholstery"]);
  const extras = attrs.filter((a) => {
    const k = a.key.trim().toLowerCase();
    if (!a.value.trim()) return false;
    return !usedKeys.has(k);
  });
  return {
    size,
    colour,
    fabric,
    variantName: variantName?.trim() || undefined,
    extras,
  };
}

export const OPEN_PO_STATUSES = ["pending", "confirmed", "in_production", "shipped"] as const;

export function isOpenPurchaseOrderStatus(status: string): boolean {
  return (OPEN_PO_STATUSES as readonly string[]).includes(status);
}

export function poStatusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
