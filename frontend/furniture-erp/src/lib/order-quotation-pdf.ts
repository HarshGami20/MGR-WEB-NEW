import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { downloadPdfDocument } from "@/lib/pdfmake-client";
import { inclusiveUnitFromExclusive } from "@/lib/gst-pricing";

export type OrderQuotationLineItem = {
  label: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  gstPercent?: number;
  imageUrls: string[];
};

export type OrderQuotationPhoto = {
  imageUrl?: string;
  comment?: string;
};

export type OrderQuotationInput = {
  orderNumber: string;
  createdAt: string;
  customerName: string;
  customerMobile?: string | null;
  customerAddress?: string | null;
  customerPincode?: string | null;
  customerGstNumber?: string | null;
  isGst: boolean;
  items: OrderQuotationLineItem[];
  subtotal?: number;
  taxAmount?: number;
  totalAmount: number;
  paidAmount?: number;
  photoComments: OrderQuotationPhoto[];
  deliveryDate?: string | null;
};

export type QuotationCompanySettings = {
  companyName?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  gstNumber?: string | null;
};

const PDF_STYLES = {
  logoHeader: { fontSize: 18, bold: true, alignment: "center" as const },
  subHeader: {
    fontSize: 8,
    alignment: "center" as const,
    letterSpacing: 2,
    margin: [0, 0, 0, 4] as [number, number, number, number],
  },
  docTitle: {
    fontSize: 12,
    bold: true,
    alignment: "center" as const,
    margin: [0, 4, 0, 6] as [number, number, number, number],
  },
  sectionTitle: { fontSize: 10, bold: true, margin: [0, 8, 0, 4] as [number, number, number, number] },
  detailLabel: { fontSize: 7.5, bold: true, color: "#666666" },
  detailValue: { fontSize: 8.5, color: "#111111" },
  muted: { fontSize: 8, color: "#555555" },
  caption: { fontSize: 7, italics: true, color: "#666666" },
};

function formatInrPdf(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function formatOrderDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

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
const PDF_IMAGE_MAX_PX = 900;

/** pdfmake/pdfkit only reliably embed JPEG and PNG data URLs. */
function isPdfSafeDataUrl(dataUrl: string): boolean {
  return /^data:image\/(jpe?g|png);base64,/i.test(dataUrl);
}

/** Re-encode any decodable browser image as JPEG for pdfmake. */
function rasterizeToJpegDataUrl(src: string): Promise<string | null> {
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
        ctx.drawImage(img, 0, 0, width, height);
        const jpeg = canvas.toDataURL("image/jpeg", 0.88);
        resolve(isPdfSafeDataUrl(jpeg) ? jpeg : null);
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

async function normalizeForPdf(dataUrl: string): Promise<string | null> {
  if (isPdfSafeDataUrl(dataUrl)) return dataUrl;
  return rasterizeToJpegDataUrl(dataUrl);
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  const work = async (): Promise<string | null> => {
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
      const rasterized = await rasterizeToJpegDataUrl(objectUrl);
      return rasterized;
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

let embeddedImageCount = 0;

async function embedImage(url: string): Promise<string | null> {
  if (embeddedImageCount >= MAX_EMBEDDED_IMAGES) return null;
  const raw = await fetchImageAsDataUrl(url);
  if (!raw) return null;
  const data = await normalizeForPdf(raw);
  if (data) embeddedImageCount += 1;
  return data;
}

/** A4 content width with 40pt side margins (~515pt). */
const PDF_CONTENT_WIDTH = 515;
const PRODUCT_GRID_COLS = 3;
const PRODUCT_CELL_W = Math.floor((PDF_CONTENT_WIDTH - 12) / PRODUCT_GRID_COLS);
const PRODUCT_CELL_H = 112;
const SITE_GRID_COLS = 2;
const SITE_CELL_W = Math.floor((PDF_CONTENT_WIDTH - 8) / SITE_GRID_COLS);
const SITE_CELL_H = 128;

function emptyGridCell(cellHeight: number): Content {
  return {
    text: "—",
    alignment: "center",
    margin: [0, cellHeight / 2 - 6, 0, 0] as [number, number, number, number],
  };
}

function coverImageBlock(dataUrl: string, width: number, height: number): Content {
  return {
    image: dataUrl,
    cover: { width, height, align: "center", valign: "center" },
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

/** Grid of cover-cropped images (3 columns for products, etc.). */
async function buildCoverImageGrid(
  urls: string[],
  columns: number,
  cellWidth: number,
  cellHeight: number,
): Promise<Content> {
  const cells = await Promise.all(
    urls.map(async (url) => {
      const data = await embedImage(url);
      const imageContent =
        data && isPdfSafeDataUrl(data)
          ? coverImageBlock(data, cellWidth, cellHeight)
          : emptyGridCell(cellHeight);
      return {
        stack: [imageContent],
        margin: [2, 2, 2, 4] as [number, number, number, number],
      } satisfies Content;
    }),
  );

  const body: Content[][] = chunk(cells, columns).map((row) => {
    const padded: Content[] = [...row];
    while (padded.length < columns) padded.push({ text: "" } as Content);
    return padded;
  });

  return {
    table: {
      widths: Array(columns).fill("*"),
      body,
    },
    layout: "noBorders",
    margin: [0, 0, 0, 8] as [number, number, number, number],
  };
}

/** Two-column grid: cover image with comment under each site photo. */
async function buildSitePhotoGrid(photos: OrderQuotationPhoto[]): Promise<Content> {
  const cards = await Promise.all(
    photos.map(async (entry) => {
      const url = entry.imageUrl!.trim();
      const data = await embedImage(url);
      const imageContent =
        data && isPdfSafeDataUrl(data)
          ? coverImageBlock(data, SITE_CELL_W, SITE_CELL_H)
          : emptyGridCell(SITE_CELL_H);
      return {
        stack: [
          imageContent,
          {
            text: entry.comment?.trim() || "—",
            fontSize: 8,
            color: "#444444",
            margin: [0, 4, 0, 0] as [number, number, number, number],
          },
        ],
        margin: [2, 2, 2, 8] as [number, number, number, number],
      } satisfies Content;
    }),
  );

  const body: Content[][] = chunk(cards, SITE_GRID_COLS).map((row) => {
    const padded: Content[] = [...row];
    while (padded.length < SITE_GRID_COLS) padded.push({ text: "" } as Content);
    return padded;
  });

  return {
    table: {
      widths: Array(SITE_GRID_COLS).fill("*"),
      body,
    },
    layout: "noBorders",
    margin: [0, 0, 0, 4] as [number, number, number, number],
  };
}

function companyHeader(settings?: QuotationCompanySettings): Content[] {
  const name = settings?.companyName?.trim() || "MGR CASA";
  const lines: Content[] = [
    { text: name, style: "logoHeader" },
    { text: "QUOTATION", style: "subHeader" },
  ];
  const contact: string[] = [];
  if (settings?.address?.trim()) contact.push(settings.address.trim());
  if (settings?.phone?.trim()) contact.push(`Ph: ${settings.phone.trim()}`);
  if (settings?.email?.trim()) contact.push(settings.email.trim());
  if (settings?.gstNumber?.trim()) contact.push(`GSTIN: ${settings.gstNumber.trim()}`);
  if (contact.length) {
    lines.push({ text: contact.join("  ·  "), alignment: "center", fontSize: 7, color: "#555555", margin: [0, 0, 0, 4] });
  }
  lines.push({
    canvas: [{ type: "line", x1: 0, y1: 2, x2: PDF_CONTENT_WIDTH, y2: 2, lineWidth: 0.5, lineColor: "#dddddd" }],
    margin: [0, 2, 0, 0] as [number, number, number, number],
  });
  return lines;
}

type DetailField = { label: string; value: string };

function detailFieldRow(field: DetailField): Content {
  return {
    columns: [
      { text: `${field.label}:`, width: 54, style: "detailLabel" },
      { text: field.value, width: "*", style: "detailValue" },
    ],
    margin: [0, 0, 0, 2] as [number, number, number, number],
  };
}

function buildDetailColumn(fields: DetailField[]): Content {
  return { stack: fields.map(detailFieldRow) };
}

/** Compact two-column order / customer details. */
function buildCompactOrderDetails(order: OrderQuotationInput): Content {
  const left: DetailField[] = [
    { label: "Order", value: order.orderNumber },
    { label: "Date", value: formatOrderDate(order.createdAt) },
    { label: "Items", value: String(order.items.length) },
  ];
  if (order.deliveryDate?.trim()) {
    left.push({ label: "Delivery", value: order.deliveryDate.trim().slice(0, 10) });
  }

  const right: DetailField[] = [{ label: "Customer", value: order.customerName }];
  if (order.customerMobile?.trim()) {
    right.push({ label: "Mobile", value: order.customerMobile.trim() });
  }
  if (order.customerAddress?.trim() || order.customerPincode?.trim()) {
    const addr = [order.customerAddress?.trim(), order.customerPincode ? `PIN ${order.customerPincode}` : ""]
      .filter(Boolean)
      .join(", ");
    right.push({ label: "Address", value: addr });
  }
  if (order.isGst && order.customerGstNumber?.trim()) {
    right.push({ label: "GSTIN", value: order.customerGstNumber.trim() });
  }

  return {
    table: {
      widths: ["*", "*"],
      body: [
        [
          { stack: [buildDetailColumn(left)], margin: [6, 5, 4, 5] },
          { stack: [buildDetailColumn(right)], margin: [4, 5, 6, 5] },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => "#e5e5e5",
      vLineColor: () => "#e5e5e5",
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    fillColor: "#f7f7f7",
    margin: [0, 0, 0, 6] as [number, number, number, number],
  };
}

function buildLineItemsTable(order: OrderQuotationInput): Content {
  const header = [
    { text: "Item", bold: true, fontSize: 8, fillColor: "#eeeeee" },
    { text: "Qty", bold: true, fontSize: 8, fillColor: "#eeeeee", alignment: "right" as const },
    {
      text: order.isGst ? "Rate (incl.)" : "Rate",
      bold: true,
      fontSize: 8,
      fillColor: "#eeeeee",
      alignment: "right" as const,
    },
    { text: "Amount", bold: true, fontSize: 8, fillColor: "#eeeeee", alignment: "right" as const },
  ];

  const rows = order.items.map((item) => {
    const rate =
      order.isGst && (item.gstPercent ?? 0) > 0
        ? inclusiveUnitFromExclusive(item.unitPrice, item.gstPercent!)
        : item.unitPrice;
    const desc = item.description?.trim();
    const labelCell = desc
      ? {
          stack: [
            { text: item.label, bold: true, fontSize: 8.5 },
            { text: desc, fontSize: 7, color: "#555555" },
          ],
        }
      : { text: item.label, fontSize: 8.5 };
    return [
      labelCell,
      { text: String(item.quantity), fontSize: 8.5, alignment: "right" as const },
      { text: formatInrPdf(rate), fontSize: 8.5, alignment: "right" as const },
      { text: formatInrPdf(item.totalPrice), fontSize: 8.5, alignment: "right" as const },
    ];
  });

  return {
    table: {
      widths: ["*", 28, 64, 64],
      body: [header, ...rows],
    },
    layout: "lightHorizontalLines",
    margin: [0, 0, 0, 4] as [number, number, number, number],
  };
}

function buildPriceSummary(order: OrderQuotationInput): Content {
  const balance = Math.max(0, order.totalAmount - (order.paidAmount ?? 0));
  const rows: Content[][] = [];

  if (order.isGst && order.subtotal != null) {
    rows.push([
      { text: "Sub Total", fontSize: 8.5 },
      { text: formatInrPdf(order.subtotal), fontSize: 8.5, alignment: "right" },
    ]);
    rows.push([
      { text: "GST", fontSize: 8.5 },
      { text: formatInrPdf(order.taxAmount ?? 0), fontSize: 8.5, alignment: "right" },
    ]);
  }
  rows.push([
    { text: "Order Total", bold: true, fontSize: 9 },
    { text: formatInrPdf(order.totalAmount), bold: true, fontSize: 9, alignment: "right" },
  ]);
  if ((order.paidAmount ?? 0) > 0) {
    rows.push([
      { text: "Paid", fontSize: 8.5 },
      { text: formatInrPdf(order.paidAmount!), fontSize: 8.5, alignment: "right" },
    ]);
    rows.push([
      { text: "Balance Due", fontSize: 8.5 },
      { text: formatInrPdf(balance), fontSize: 8.5, alignment: "right" },
    ]);
  }

  return {
    table: {
      widths: ["*", "auto"],
      body: rows,
    },
    layout: "noBorders",
    margin: [200, 0, 0, 4] as [number, number, number, number],
  };
}

async function buildProductImagesSection(order: OrderQuotationInput): Promise<Content[]> {
  const blocks: Content[] = [];
  let any = false;
  for (const item of order.items) {
    if (item.imageUrls.length === 0) continue;
    any = true;
    blocks.push({ text: item.label, bold: true, fontSize: 8.5, margin: [0, 4, 0, 2] });
    blocks.push(
      await buildCoverImageGrid(item.imageUrls, PRODUCT_GRID_COLS, PRODUCT_CELL_W, PRODUCT_CELL_H),
    );
  }
  if (!any) return [];
  return [{ text: "Product images", style: "sectionTitle" }, ...blocks];
}

async function buildSitePhotosSection(photos: OrderQuotationPhoto[]): Promise<Content[]> {
  const withImage = photos.filter((p) => p.imageUrl?.trim());
  if (withImage.length === 0) return [];

  return [
    { text: "Site photos & comments", style: "sectionTitle" },
    await buildSitePhotoGrid(withImage),
  ];
}

export async function buildOrderQuotationDocument(
  order: OrderQuotationInput,
  settings?: QuotationCompanySettings,
): Promise<TDocumentDefinitions> {
  embeddedImageCount = 0;

  const content: Content[] = [
    ...companyHeader(settings),
    { text: "Order Quotation", style: "docTitle" },
    { text: "Order details", style: "sectionTitle" },
    buildCompactOrderDetails(order),
    { text: "Line items", style: "sectionTitle" },
    buildLineItemsTable(order),
    buildPriceSummary(order),
    ...(await buildProductImagesSection(order)),
    ...(await buildSitePhotosSection(order.photoComments)),
    {
      text: "This is a computer-generated quotation and is subject to confirmation.",
      style: "caption",
      alignment: "center",
      margin: [0, 12, 0, 0] as [number, number, number, number],
    },
  ];

  return {
    pageSize: "A4",
    pageMargins: [36, 36, 36, 36],
    content,
    styles: PDF_STYLES,
    defaultStyle: { fontSize: 9 },
  };
}

export async function downloadOrderQuotationPdf(
  order: OrderQuotationInput,
  settings?: QuotationCompanySettings,
): Promise<void> {
  const doc = await Promise.race([
    buildOrderQuotationDocument(order, settings),
    new Promise<never>((_, reject) => {
      window.setTimeout(
        () => reject(new Error("Quotation took too long to prepare. Refresh and try again.")),
        120_000,
      );
    }),
  ]);
  const safeName = order.orderNumber.replace(/[^\w.-]+/g, "_");
  await downloadPdfDocument(doc, `Quotation_${safeName}.pdf`);
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
  const balance = Math.max(0, order.totalAmount - (order.paidAmount ?? 0));
  const lines = [
    `*${company} — Quotation*`,
    "",
    `Order: *${order.orderNumber}*`,
    `Customer: ${order.customerName}`,
    order.customerMobile?.trim() ? `Mobile: ${order.customerMobile.trim()}` : "",
    "",
    `*Total: ${formatInrPdf(order.totalAmount)}*`,
    (order.paidAmount ?? 0) > 0 ? `Paid: ${formatInrPdf(order.paidAmount!)}` : "",
    (order.paidAmount ?? 0) > 0 ? `Balance: ${formatInrPdf(balance)}` : "",
    "",
    `${order.items.length} item(s). Please find the detailed quotation PDF attached separately or request it from our team.`,
  ].filter(Boolean);
  return lines.join("\n");
}

export function openWhatsAppForOrder(order: OrderQuotationInput, settings?: QuotationCompanySettings): void {
  const phone = normalizeWhatsAppPhone(order.customerMobile);
  const text = buildWhatsAppQuotationMessage(order, settings);
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
