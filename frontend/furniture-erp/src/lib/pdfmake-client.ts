import type { TDocumentDefinitions } from "pdfmake/interfaces";
// Static imports avoid a separate lazy chunk (fixes "Failed to fetch dynamically imported module" on LAN/IP hosts).
import pdfMakeModule from "pdfmake/build/pdfmake.js";
import vfsFontsModule from "pdfmake/build/vfs_fonts.js";

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

let pdfMakeInstance: PdfMakeBrowser | null = null;

function resolvePdfMakeModule(mod: unknown): PdfMakeBrowser {
  return (mod as { default?: PdfMakeBrowser }).default ?? (mod as PdfMakeBrowser);
}

function resolveVfs(mod: unknown): Record<string, string> {
  return (mod as { default?: Record<string, string> }).default ?? (mod as Record<string, string>);
}

function initializePdfMake(): PdfMakeBrowser {
  if (pdfMakeInstance) return pdfMakeInstance;

  const pdfMake = resolvePdfMakeModule(pdfMakeModule);
  const vfs = resolveVfs(vfsFontsModule);
  assertRobotoFonts(vfs);

  if (typeof pdfMake.addVirtualFileSystem !== "function") {
    throw new Error("Unsupported pdfmake version.");
  }
  pdfMake.addVirtualFileSystem(vfs);
  pdfMakeInstance = pdfMake;
  return pdfMakeInstance;
}

/** pdfmake + vfs fonts (initialized once per page load). */
export async function getPdfMake(): Promise<PdfMakeBrowser> {
  return initializePdfMake();
}

/** Generate a PDF blob in the browser. */
export async function generatePdfBlob(doc: TDocumentDefinitions): Promise<Blob> {
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
  return blob;
}

/** Save a PDF blob via a direct browser download. */
export function downloadPdfBlob(blob: Blob, filename: string): void {
  triggerBrowserDownload(blob, filename);
}

/** Generate a PDF and download it via a direct browser save (works without file-saver). */
export async function downloadPdfDocument(doc: TDocumentDefinitions, filename: string): Promise<void> {
  const blob = await generatePdfBlob(doc);
  downloadPdfBlob(blob, filename);
}
