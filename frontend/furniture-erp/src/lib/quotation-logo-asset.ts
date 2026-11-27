import quotationLogoUrl from "@/assets/fulllogo.png";
import type { QuotationPdfImage } from "@/lib/quotation-pdf-layout";

let cachedLogo: QuotationPdfImage | null = null;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("logo read failed"));
    reader.readAsDataURL(blob);
  });
}

function measureImage(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve(img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** MGR CASA wordmark as a pdfmake-safe PNG (keeps transparency), or null if it cannot be loaded. */
export async function getQuotationLogo(): Promise<QuotationPdfImage | null> {
  if (cachedLogo) return cachedLogo;
  if (typeof window === "undefined") return null;

  try {
    const res = await fetch(quotationLogoUrl);
    if (!res.ok) return null;
    const dataUrl = await blobToDataUrl(await res.blob());
    if (!/^data:image\/png;base64,/i.test(dataUrl)) return null;
    const size = await measureImage(dataUrl);
    if (!size) return null;
    cachedLogo = { dataUrl, ...size };
    return cachedLogo;
  } catch {
    return null;
  }
}
