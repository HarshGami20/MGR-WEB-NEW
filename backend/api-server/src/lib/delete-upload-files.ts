import fs from "node:fs";
import path from "node:path";

const uploadsRoot = path.resolve(process.cwd(), "uploads");

/** Map `/uploads/...` URL to an absolute path under the uploads directory, or null if unsafe. */
export function resolveUploadDiskPath(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed.startsWith("/uploads/")) return null;

  const relative = trimmed.slice("/uploads/".length);
  if (!relative || relative.includes("..")) return null;

  const full = path.resolve(uploadsRoot, relative);
  const rel = path.relative(uploadsRoot, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;

  return full;
}

/** Best-effort removal of local upload files referenced by URL (does not throw). */
export function deleteUploadFilesByUrl(urls: Iterable<string>): void {
  const seen = new Set<string>();
  for (const url of urls) {
    const diskPath = resolveUploadDiskPath(url);
    if (!diskPath || seen.has(diskPath)) continue;
    seen.add(diskPath);
    try {
      if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
    } catch {
      /* ignore — order delete should succeed even if a file is already gone */
    }
  }
}
