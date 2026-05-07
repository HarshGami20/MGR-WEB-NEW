/** Resolved URL/path for displaying a stored product or variant image. */
export function resolvedProductImageUrl(url?: string | null): string | undefined {
  if (url == null || url.trim() === "") return undefined;
  return url.startsWith("/") || url.startsWith("http") ? url : `/uploads/${url.replace(/^\/+/, "")}`;
}
