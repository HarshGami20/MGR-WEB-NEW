export function parseImageUrlsJson(
  imageUrls: string | null | undefined,
  legacyImageUrl?: string | null,
): string[] {
  if (imageUrls?.trim()) {
    try {
      const parsed = JSON.parse(imageUrls);
      if (Array.isArray(parsed)) {
        return parsed
          .map((u) => (typeof u === "string" ? u.trim() : ""))
          .filter(Boolean);
      }
    } catch {
      /* fall through */
    }
  }
  const legacy = legacyImageUrl?.trim();
  return legacy ? [legacy] : [];
}

export function serializeImageUrls(urls: string[] | null | undefined): {
  imageUrls: string | null;
  imageUrl: string | null;
} {
  const cleaned = (urls ?? [])
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean);
  return {
    imageUrls: cleaned.length > 0 ? JSON.stringify(cleaned) : null,
    imageUrl: cleaned[0] ?? null,
  };
}
