import { parseImageUrlsJson } from "./image-urls";

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export type OrderUploadSource = {
  challanImages: string | null;
  photoComments: string | null;
  items: Array<{ customImageUrl: string | null; customImageUrls: string | null }>;
  complaints: Array<{ imageUrls: string | null }>;
};

/** Collect all `/uploads/...` URLs stored on an order and its related records. */
export function collectOrderUploadUrls(order: OrderUploadSource): string[] {
  const urls = new Set<string>();

  for (const url of safeJsonParse<string[]>(order.challanImages, [])) {
    if (typeof url === "string" && url.trim()) urls.add(url.trim());
  }

  for (const entry of safeJsonParse<Array<{ imageUrl?: string }>>(order.photoComments, [])) {
    if (entry?.imageUrl?.trim()) urls.add(entry.imageUrl.trim());
  }

  for (const item of order.items) {
    for (const url of parseImageUrlsJson(item.customImageUrls, item.customImageUrl)) {
      urls.add(url);
    }
  }

  for (const complaint of order.complaints) {
    for (const url of parseImageUrlsJson(complaint.imageUrls, null)) {
      urls.add(url);
    }
  }

  return [...urls];
}
