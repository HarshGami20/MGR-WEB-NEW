import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { downloadPdfBlob, downloadPdfDocument, generatePdfBlob } from "@/lib/pdfmake-client";
import { formatInr } from "@/lib/format-currency";
import { roundMoney } from "@/lib/gst-pricing";
import { getQuotationLogo } from "@/lib/quotation-logo-asset";
import {
  buildQuotationDocument,
  collectQuotationImageUrls,
  type OrderQuotationInput,
  type QuotationCompanySettings,
  type QuotationPdfImage,
} from "@/lib/quotation-pdf-layout";

export type {
  OrderQuotationInput,
  OrderQuotationLineItem,
  OrderQuotationPhoto,
  QuotationCompanySettings,
} from "@/lib/quotation-pdf-layout";

function absoluteImageUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (typeof window !== "undefined") {
    return new URL(trimmed.startsWith("/") ? trimmed : `/uploads/${trimmed.replace(/^\/+/, "")}`, window.location.origin)
      .href;
  }
  return trimmed;
}

const IMAGE_FETCH_MS = 6_000;
const MAX_EMBEDDED_IMAGES = 24;
const IMAGE_FETCH_CONCURRENCY = 4;
const PDF_IMAGE_MAX_PX = 900;
const PREPARE_TIMEOUT_MS = 120_000;

/** pdfmake/pdfkit only reliably embed JPEG and PNG data URLs. */
function isPdfSafeDataUrl(dataUrl: string): boolean {
  return /^data:image\/(jpe?g|png);base64,/i.test(dataUrl);
}

/** Re-encode any decodable browser image as JPEG for pdfmake (transparent areas become white). */
function rasterizeToJpeg(src: string): Promise<QuotationPdfImage | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => resolve(null), IMAGE_FETCH_MS);
    img.onload = () => {
      window.clearTimeout(timer);
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        if (!width || !height) {
          resolve(null);
          return;
        }
        const scale = Math.min(1, PDF_IMAGE_MAX_PX / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
        resolve(isPdfSafeDataUrl(dataUrl) ? { dataUrl, width, height } : null);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

/** Fetch one image for the PDF. Any failure or timeout returns null so the PDF still builds. */
async function fetchImage(url: string): Promise<QuotationPdfImage | null> {
  const work = async (): Promise<QuotationPdfImage | null> => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), IMAGE_FETCH_MS);
    let objectUrl: string | null = null;
    try {
      const res = await fetch(absoluteImageUrl(url), {
        credentials: "include",
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (blob.type.startsWith("image/svg")) return null;
      objectUrl = URL.createObjectURL(blob);
      return await rasterizeToJpeg(objectUrl);
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  };
  return Promise.race([
    work(),
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), IMAGE_FETCH_MS + 500)),
  ]);
}

/** Embed the first MAX_EMBEDDED_IMAGES urls, a few at a time. */
async function loadQuotationImages(urls: string[]): Promise<Map<string, QuotationPdfImage | null>> {
  const targets = urls.slice(0, MAX_EMBEDDED_IMAGES);
  const images = new Map<string, QuotationPdfImage | null>();
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const url = targets[next++];
      images.set(url, await fetchImage(url));
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMAGE_FETCH_CONCURRENCY, targets.length) }, worker));
  return images;
}

export async function buildOrderQuotationDocument(
  order: OrderQuotationInput,
  settings?: QuotationCompanySettings,
): Promise<TDocumentDefinitions> {
  const [images, logo] = await Promise.all([
    loadQuotationImages(collectQuotationImageUrls(order)),
    getQuotationLogo(),
  ]);
  return buildQuotationDocument(order, settings, { images, logo });
}

function prepareQuotationDocument(
  order: OrderQuotationInput,
  settings?: QuotationCompanySettings,
): Promise<TDocumentDefinitions> {
  let timer: number | undefined;
  return Promise.race([
    buildOrderQuotationDocument(order, settings),
    new Promise<never>((_, reject) => {
      timer = window.setTimeout(
        () => reject(new Error("Quotation took too long to prepare. Refresh and try again.")),
        PREPARE_TIMEOUT_MS,
      );
    }),
  ]).finally(() => window.clearTimeout(timer));
}

function quotationFilename(orderNumber: string): string {
  return `Quotation_${orderNumber.replace(/[^\w.-]+/g, "_")}.pdf`;
}

export async function downloadOrderQuotationPdf(
  order: OrderQuotationInput,
  settings?: QuotationCompanySettings,
): Promise<void> {
  const doc = await prepareQuotationDocument(order, settings);
  await downloadPdfDocument(doc, quotationFilename(order.orderNumber));
}

export function normalizeWhatsAppPhone(mobile?: string | null): string | null {
  if (!mobile?.trim()) return null;
  const digits = mobile.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length >= 10) return digits;
  return null;
}

export function buildWhatsAppQuotationMessage(
  order: OrderQuotationInput,
  settings?: QuotationCompanySettings,
): string {
  const company = settings?.companyName?.trim() || "MGR CASA";
  const lineSubtotal = roundMoney(Number(order.subtotal ?? 0));
  const taxAmount = roundMoney(Number(order.taxAmount ?? 0));
  const itemsTotal = roundMoney(lineSubtotal + taxAmount);
  const deliveryCharge = roundMoney(Number(order.deliveryCharge ?? 0));
  const discountAmount = roundMoney(Number(order.discountAmount ?? 0));
  const total = roundMoney(Number(order.totalAmount));
  const balance = Math.max(0, total - (order.paidAmount ?? 0));
  const lines = [
    `*${company} — Quotation*`,
    "",
    `Order: *${order.orderNumber}*`,
    `Customer: ${order.customerName}`,
    order.customerMobile?.trim() ? `Mobile: ${order.customerMobile.trim()}` : "",
    "",
    `Subtotal: ${formatInr(itemsTotal)}`,
    `Delivery charge: ${formatInr(deliveryCharge)}`,
    discountAmount > 0 ? `Discount: -${formatInr(discountAmount)}` : "",
    `*Total: ${formatInr(total)}*`,
    (order.paidAmount ?? 0) > 0 ? `Paid: ${formatInr(order.paidAmount!)}` : "",
    (order.paidAmount ?? 0) > 0 ? `Balance: ${formatInr(balance)}` : "",
    "",
    `${order.items.length} item(s). Please find the detailed quotation PDF attached separately or request it from our team.`,
  ].filter(Boolean);
  return lines.join("\n");
}

function openWhatsAppUrl(phone: string | null, text: string): void {
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function openWhatsAppForOrder(order: OrderQuotationInput, settings?: QuotationCompanySettings): void {
  const phone = normalizeWhatsAppPhone(order.customerMobile);
  const text = buildWhatsAppQuotationMessage(order, settings);
  openWhatsAppUrl(phone, text);
}

/** Download quotation PDF, then open WhatsApp to the customer with the quotation message. */
export async function shareOrderQuotationViaWhatsApp(
  order: OrderQuotationInput,
  settings?: QuotationCompanySettings,
): Promise<void> {
  const phone = normalizeWhatsAppPhone(order.customerMobile);
  if (!phone) {
    throw new Error("Customer phone number is missing or invalid. Add a mobile number on the order first.");
  }

  const text = buildWhatsAppQuotationMessage(order, settings);
  const doc = await prepareQuotationDocument(order, settings);
  const filename = quotationFilename(order.orderNumber);
  const blob = await generatePdfBlob(doc);
  const file = new File([blob], filename, { type: "application/pdf" });
  const shareData: ShareData = { files: [file], text, title: filename };

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      if (!navigator.canShare || navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
    }
  }

  downloadPdfBlob(blob, filename);
  openWhatsAppUrl(phone, text);
}
