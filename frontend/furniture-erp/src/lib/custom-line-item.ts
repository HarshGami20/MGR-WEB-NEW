/** Custom line item fields stored only on order/PO — not in product catalog. */

export type CustomLineSpec = {
  size?: string;
  colour?: string;
  fabric?: string;
};

export function customSpecToJson(spec: CustomLineSpec): string | null {
  const obj: Record<string, string> = {};
  if (spec.size?.trim()) obj.Size = spec.size.trim();
  if (spec.colour?.trim()) obj.Colour = spec.colour.trim();
  if (spec.fabric?.trim()) obj.Fabric = spec.fabric.trim();
  return Object.keys(obj).length > 0 ? JSON.stringify(obj) : null;
}

export function customSpecFromJson(json: string | null | undefined): CustomLineSpec {
  if (!json?.trim()) return {};
  try {
    const parsed = JSON.parse(json) as Record<string, string>;
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const hit = Object.entries(parsed).find(([key]) => key.toLowerCase() === k.toLowerCase());
        if (hit?.[1]?.trim()) return String(hit[1]).trim();
      }
      return undefined;
    };
    return {
      size: pick("size", "Size", "dimensions"),
      colour: pick("colour", "color", "Colour", "Color"),
      fabric: pick("fabric", "Fabric", "material", "Material"),
    };
  } catch {
    return {};
  }
}

export const defaultCatalogLineItem = {
  isCustom: false as const,
  productId: 0,
  variantId: null as number | null,
  customName: "",
  customSize: "",
  customColour: "",
  customFabric: "",
  customImageUrls: [] as string[],
  description: "",
  gstPercent: 0,
  quantity: 1,
  unitPrice: 0,
};

export const defaultCustomLineItem = {
  isCustom: true as const,
  productId: null as number | null,
  variantId: null as number | null,
  customName: "",
  customSize: "",
  customColour: "",
  customFabric: "",
  customImageUrls: [] as string[],
  description: "",
  gstPercent: 0,
  quantity: 1,
  unitPrice: 0,
};
