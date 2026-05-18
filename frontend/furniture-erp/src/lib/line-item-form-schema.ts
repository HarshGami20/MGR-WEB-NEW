import { z } from "zod";
import { parseImageUrlsList } from "@/lib/image-urls";
import { inclusiveUnitFromExclusive } from "@/lib/gst-pricing";

export const lineItemFormSchema = z
  .object({
    isCustom: z.boolean().default(false),
    productId: z.union([z.coerce.number(), z.null()]).optional(),
    variantId: z.coerce.number().optional().nullable(),
    customName: z.string().optional().default(""),
    customSize: z.string().optional().default(""),
    customColour: z.string().optional().default(""),
    customFabric: z.string().optional().default(""),
    customImageUrls: z.array(z.string()).default([]),
    description: z.string().optional().default(""),
    quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
    unitPrice: z.coerce.number().min(0, "Price must be ≥ 0").default(0),
    gstPercent: z.coerce.number().min(0).max(100).default(0),
  })
  .superRefine((data, ctx) => {
    if (data.isCustom) {
      if (!data.customName?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Product name is required",
          path: ["customName"],
        });
      }
      return;
    }
    const pid = data.productId != null ? Number(data.productId) : 0;
    if (!pid || pid < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select a product or switch to custom",
        path: ["productId"],
      });
    }
  });

export type LineItemFormValues = z.infer<typeof lineItemFormSchema>;

export function lineItemToApiPayload(item: LineItemFormValues) {
  if (item.isCustom) {
    return {
      isCustom: true,
      productId: null,
      variantId: null,
      customName: item.customName.trim(),
      customSize: item.customSize?.trim() || "",
      customColour: item.customColour?.trim() || "",
      customFabric: item.customFabric?.trim() || "",
      customImageUrls: item.customImageUrls?.length ? item.customImageUrls : undefined,
      description: item.description?.trim() || undefined,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    };
  }
  return {
    isCustom: false,
    productId: Number(item.productId),
    variantId: item.variantId != null && item.variantId > 0 ? Number(item.variantId) : null,
    description: item.description?.trim() || undefined,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
  };
}

export function apiItemToFormValues(
  item: {
    isCustom?: boolean;
    productId?: number | null;
    variantId?: number | null;
    customName?: string | null;
    customImageUrl?: string | null;
    customImageUrls?: string[] | null;
    customAttributes?: string | null;
    description?: string | null;
    quantity?: number;
    unitPrice?: number;
    gstPercent?: number;
    product?: { id?: number; price?: number; gstPercent?: number } | null;
  },
  opts?: { priceIncludesGst?: boolean },
): LineItemFormValues {
  const gstPercent = Number(item.gstPercent ?? item.product?.gstPercent ?? 0);
  const storedUnit = Number(item.unitPrice ?? item.product?.price ?? 0);
  const displayUnit =
    opts?.priceIncludesGst && gstPercent > 0
      ? inclusiveUnitFromExclusive(storedUnit, gstPercent)
      : storedUnit;
  if (item.isCustom) {
    let size = "";
    let colour = "";
    let fabric = "";
    if (item.customAttributes) {
      try {
        const o = JSON.parse(item.customAttributes) as Record<string, string>;
        const pick = (...keys: string[]) => {
          for (const k of keys) {
            const e = Object.entries(o).find(([key]) => key.toLowerCase() === k.toLowerCase());
            if (e?.[1]) return String(e[1]);
          }
          return "";
        };
        size = pick("size", "Size");
        colour = pick("colour", "color", "Colour", "Color");
        fabric = pick("fabric", "Fabric", "material");
      } catch {
        /* ignore */
      }
    }
    return {
      isCustom: true,
      productId: null,
      variantId: null,
      customName: item.customName ?? "",
      customSize: size,
      customColour: colour,
      customFabric: fabric,
      customImageUrls: parseImageUrlsList(item.customImageUrls, item.customImageUrl),
      description: item.description ?? "",
      quantity: item.quantity ?? 1,
      unitPrice: displayUnit,
      gstPercent,
    };
  }
  return {
    isCustom: false,
    productId: item.productId ?? item.product?.id ?? 0,
    variantId: item.variantId ?? null,
    customName: "",
    customSize: "",
    customColour: "",
    customFabric: "",
    customImageUrls: [],
    description: item.description ?? "",
    quantity: item.quantity ?? 1,
    unitPrice: displayUnit,
    gstPercent,
  };
}
