import { serializeImageUrls, parseImageUrlsJson } from "./image-urls";

export type IncomingLineItem = {
  isCustom?: boolean;
  productId?: number | null;
  variantId?: number | null;
  customName?: string | null;
  customSize?: string | null;
  customColour?: string | null;
  customFabric?: string | null;
  customImageUrl?: string | null;
  customImageUrls?: string[] | null;
  customAttributes?: string | null;
  description?: string | null;
  quantity: number;
  unitPrice: number;
};

export function normalizeLineDescription(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveCustomLineImages(item: IncomingLineItem): {
  customImageUrl: string | null;
  customImageUrls: string | null;
} {
  if (item.customImageUrls !== undefined) {
    const { imageUrl, imageUrls } = serializeImageUrls(item.customImageUrls);
    return { customImageUrl: imageUrl, customImageUrls: imageUrls };
  }
  const { imageUrl, imageUrls } = serializeImageUrls(
    parseImageUrlsJson(null, item.customImageUrl),
  );
  return { customImageUrl: imageUrl, customImageUrls: imageUrls };
}

export function isCustomLineItem(item: IncomingLineItem): boolean {
  if (item.isCustom === true) return true;
  if (item.productId == null || item.productId === 0) return true;
  return Boolean(item.customName?.trim() && !item.productId);
}

export function buildCustomAttributesJson(item: IncomingLineItem): string | null {
  if (item.customAttributes?.trim()) return item.customAttributes.trim();
  const obj: Record<string, string> = {};
  if (item.customSize?.trim()) obj.Size = item.customSize.trim();
  if (item.customColour?.trim()) obj.Colour = item.customColour.trim();
  if (item.customFabric?.trim()) obj.Fabric = item.customFabric.trim();
  return Object.keys(obj).length > 0 ? JSON.stringify(obj) : null;
}
