import { serializeImageUrls, parseImageUrlsJson } from "./image-urls";

export const DEFAULT_CUSTOM_PRODUCT_NAME = "Custom product";

export function resolveCustomProductName(name?: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed || DEFAULT_CUSTOM_PRODUCT_NAME;
}

export type CustomImageComment = {
  imageUrl: string;
  comment?: string;
};

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
  customImageComments?: CustomImageComment[] | null;
  customAttributes?: string | null;
  description?: string | null;
  quantity: number;
  unitPrice: number;
};

export function normalizeLineDescription(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function parseCustomImageCommentsJson(
  raw: string | null | undefined,
): CustomImageComment[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row) => row && typeof row.imageUrl === "string" && row.imageUrl.trim())
      .map((row) => ({
        imageUrl: String(row.imageUrl).trim(),
        comment: typeof row.comment === "string" ? row.comment.trim() : "",
      }));
  } catch {
    return [];
  }
}

export function normalizeCustomImageComments(
  comments: unknown,
  imageUrls: string[],
): string | null {
  const byUrl = new Map<string, string>();
  if (Array.isArray(comments)) {
    for (const row of comments) {
      if (!row || typeof row !== "object") continue;
      const imageUrl = (row as CustomImageComment).imageUrl;
      if (typeof imageUrl !== "string" || !imageUrl.trim()) continue;
      const comment =
        typeof (row as CustomImageComment).comment === "string"
          ? (row as CustomImageComment).comment!.trim()
          : "";
      byUrl.set(imageUrl.trim(), comment);
    }
  }
  const out: CustomImageComment[] = [];
  for (const url of imageUrls) {
    const key = url.trim();
    if (!key) continue;
    const comment = byUrl.get(key) ?? "";
    out.push(comment ? { imageUrl: key, comment } : { imageUrl: key });
  }
  return out.length > 0 ? JSON.stringify(out) : null;
}

export function resolveCustomLineImages(item: IncomingLineItem): {
  customImageUrl: string | null;
  customImageUrls: string | null;
  customImageComments: string | null;
} {
  let urls: string[] = [];
  if (item.customImageUrls !== undefined) {
    const { imageUrl, imageUrls } = serializeImageUrls(item.customImageUrls);
    urls = parseImageUrlsJson(imageUrls, imageUrl);
  } else {
    urls = parseImageUrlsJson(null, item.customImageUrl);
  }
  const customImageComments = normalizeCustomImageComments(item.customImageComments, urls);
  const { imageUrl, imageUrls } = serializeImageUrls(urls);
  return { customImageUrl: imageUrl, customImageUrls: imageUrls, customImageComments };
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
