/** Parse product or custom-line image URL lists from API (JSON column + legacy single URL). */
export function parseImageUrlsList(
  imageUrls?: string | string[] | null,
  legacyImageUrl?: string | null,
): string[] {
  if (Array.isArray(imageUrls)) {
    return imageUrls.map((u) => String(u).trim()).filter(Boolean);
  }
  if (typeof imageUrls === "string" && imageUrls.trim()) {
    try {
      const parsed = JSON.parse(imageUrls);
      if (Array.isArray(parsed)) {
        return parsed.map((u) => String(u).trim()).filter(Boolean);
      }
    } catch {
      /* fall through */
    }
  }
  const legacy = legacyImageUrl?.trim();
  return legacy ? [legacy] : [];
}

export function productImageList(product: {
  imageUrls?: string | string[] | null;
  imageUrl?: string | null;
}): string[] {
  return parseImageUrlsList(product.imageUrls, product.imageUrl);
}

export function variantImageList(variant: {
  imageUrls?: string | string[] | null;
  imageUrl?: string | null;
}): string[] {
  return parseImageUrlsList(variant.imageUrls, variant.imageUrl);
}
