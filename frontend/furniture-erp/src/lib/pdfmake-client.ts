import type { TDocumentDefinitions } from "pdfmake/interfaces";

/** Browser pdfmake instance with vfs + createPdf (types are loose; pdfmake CJS interop). */
export type PdfMakeBrowser = {
  vfs: Record<string, string>;
  createPdf: (doc: TDocumentDefinitions) => { download: (filename: string) => void };
};

/** Lazy-load pdfmake + vfs fonts for browser PDF downloads (Vite-compatible). */
export async function getPdfMake(): Promise<PdfMakeBrowser> {
  const pdfMakeMod = await import("pdfmake/build/pdfmake");
  const pdfMake =
    (pdfMakeMod as unknown as { default?: PdfMakeBrowser }).default ?? (pdfMakeMod as unknown as PdfMakeBrowser);
  const vfsMod = await import("pdfmake/build/vfs_fonts");
  const vfs =
    (vfsMod as { default?: Record<string, string> }).default ?? (vfsMod as unknown as Record<string, string>);
  pdfMake.vfs = vfs;
  return pdfMake;
}
