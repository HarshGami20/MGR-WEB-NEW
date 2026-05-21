import type { TDocumentDefinitions } from "pdfmake/interfaces";

/** Browser pdfmake instance (pdfmake 0.3+ singleton with createPdf). */
export type PdfMakeBrowser = {
  addVirtualFileSystem?: (vfs: Record<string, string>) => void;
  createPdf: (doc: TDocumentDefinitions) => {
    download: (filename?: string) => Promise<void>;
    getBlob: () => Promise<Blob>;
  };
};

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function assertRobotoFonts(vfs: Record<string, string>): void {
  if (!vfs["Roboto-Regular.ttf"]) {
    throw new Error("PDF fonts failed to load. Refresh the page and try again.");
  }
}

/** Lazy-load pdfmake + vfs fonts for browser PDF downloads (Vite-compatible). */
export async function getPdfMake(): Promise<PdfMakeBrowser> {
  const [pdfMakeMod, vfsMod] = await Promise.all([
    import("pdfmake/build/pdfmake.js"),
    import("pdfmake/build/vfs_fonts.js"),
  ]);
  const pdfMake =
    (pdfMakeMod as unknown as { default?: PdfMakeBrowser }).default ?? (pdfMakeMod as unknown as PdfMakeBrowser);
  const vfs =
    (vfsMod as { default?: Record<string, string> }).default ?? (vfsMod as unknown as Record<string, string>);
  assertRobotoFonts(vfs);
  if (typeof pdfMake.addVirtualFileSystem === "function") {
    pdfMake.addVirtualFileSystem(vfs);
  } else {
    throw new Error("Unsupported pdfmake version.");
  }
  return pdfMake;
}

/** Generate a PDF and download it via a direct browser save (works without file-saver). */
export async function downloadPdfDocument(doc: TDocumentDefinitions, filename: string): Promise<void> {
  const pdfMake = await getPdfMake();
  const pdfDoc = pdfMake.createPdf(doc);
  const blob = await Promise.race([
    pdfDoc.getBlob(),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("PDF generation timed out. Try again.")), 90_000);
    }),
  ]);
  if (!blob || blob.size === 0) {
    throw new Error("PDF file was empty.");
  }
  triggerBrowserDownload(blob, filename);
}
