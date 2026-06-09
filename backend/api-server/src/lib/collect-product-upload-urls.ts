import { parseImageUrlsJson } from "./image-urls";

export type ProductUploadSource = {
  imageUrl: string | null;
  imageUrls: string | null;
  variants: Array<{ imageUrl: string | null; imageUrls: string | null }>;
};

export type VariantUploadSource = {
  imageUrl: string | null;
  imageUrls: string | null;
};

/** Collect all `/uploads/...` URLs stored on a product and its variants. */
export function collectProductUploadUrls(product: ProductUploadSource): string[] {
  const urls = new Set<string>();

  for (const url of parseImageUrlsJson(product.imageUrls, product.imageUrl)) {
    urls.add(url);
  }

  for (const variant of product.variants) {
    for (const url of parseImageUrlsJson(variant.imageUrls, variant.imageUrl)) {
      urls.add(url);
    }
  }

  return [...urls];
}

/** Collect all `/uploads/...` URLs stored on a single variant. */
export function collectVariantUploadUrls(variant: VariantUploadSource): string[] {
  return parseImageUrlsJson(variant.imageUrls, variant.imageUrl);
}
