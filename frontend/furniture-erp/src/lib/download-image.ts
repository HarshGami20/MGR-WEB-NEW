function filenameFromSrc(src: string, index = 0): string {
  try {
    const path = new URL(src, window.location.origin).pathname;
    const base = path.split("/").pop()?.split("?")[0];
    if (base && /\.[a-z0-9]{2,5}$/i.test(base)) return base;
  } catch {
    /* ignore */
  }
  return `image-${index + 1}.jpg`;
}

/** Download an image shown in the gallery (same-origin / uploads). */
export async function downloadImageFromUrl(src: string, index = 0): Promise<void> {
  const filename = filenameFromSrc(src, index);
  const absolute = src.startsWith("http") || src.startsWith("blob:") ? src : new URL(src, window.location.origin).href;

  try {
    const res = await fetch(absolute, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    return;
  } catch {
    const anchor = document.createElement("a");
    anchor.href = absolute;
    anchor.download = filename;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
}
