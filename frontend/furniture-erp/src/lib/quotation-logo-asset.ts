import quotationLogoUrl from "@/assets/fulllogo.png";

let cachedLogoDataUrl: string | null = null;

function isPdfSafeDataUrl(dataUrl: string): boolean {
  return /^data:image\/(jpe?g|png);base64,/i.test(dataUrl);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("logo read failed"));
    reader.readAsDataURL(blob);
  });
}

/** MGR CASA full logo as a pdfmake-safe PNG data URL. */
export async function getQuotationLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  if (typeof window === "undefined") return null;

  try {
    const res = await fetch(quotationLogoUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size || blob.type.startsWith("image/svg")) return null;

    const dataUrl = await blobToDataUrl(blob);
    if (!isPdfSafeDataUrl(dataUrl)) return null;

    cachedLogoDataUrl = dataUrl;
    return cachedLogoDataUrl;
  } catch {
    return null;
  }
}

/** Fixed logo height in PDF points (pdfmake). */
export const QUOTATION_LOGO_HEIGHT = 40;

/** Native logo aspect (300 x 59). */
export const QUOTATION_LOGO_ASPECT = 59 / 300;
