import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { downloadPdfBlob, downloadPdfDocument, generatePdfBlob } from "@/lib/pdfmake-client";
import { formatInr } from "@/lib/format-currency";
import { formatDisplayDate } from "@/lib/format-datetime";
import { inclusiveUnitFromExclusive, roundMoney } from "@/lib/gst-pricing";

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
  deliveryCharge?: number;
  totalAmount: number;
  paidAmount?: number;
  photoComments: OrderQuotationPhoto[];
  challanImageUrls: string[];
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
const PDF_PAGE_USABLE_HEIGHT = 842 - 72;
const CHALLAN_IMAGE_HEIGHT = 400;
/** 2×2 image grid — 4 images per page. */
const IMAGE_GRID_COLS = 2;
const IMAGE_GRID_ROWS = 2;
const IMAGES_PER_PAGE = IMAGE_GRID_COLS * IMAGE_GRID_ROWS;
const IMAGE_GRID_ROW_GAP = 8;
const IMAGE_COMMENT_BLOCK = 16;
const IMAGE_CELL_W = Math.floor((PDF_CONTENT_WIDTH - 8) / IMAGE_GRID_COLS);
/** Height tuned so two rows fit on one page without row/page breaks. */
const PRODUCT_IMAGE_CELL_H = Math.floor(
  (PDF_PAGE_USABLE_HEIGHT - IMAGE_GRID_ROW_GAP) / IMAGE_GRID_ROWS - 32,
);
const SITE_IMAGE_CELL_H = Math.floor(
  (PDF_PAGE_USABLE_HEIGHT - IMAGE_GRID_ROW_GAP) / IMAGE_GRID_ROWS - IMAGE_COMMENT_BLOCK - 32,
);

function emptyGridCell(cellHeight: number): Content {
  return {
    text: "—",
    alignment: "center",
    margin: [0, cellHeight / 2 - 6, 0, 0] as [number, number, number, number],
  };
}

function containImageBlock(dataUrl: string, width: number, height: number): Content {
  return {
    image: dataUrl,
    fit: [width, height],
    alignment: "center",
  };
}

function gridImageBlock(dataUrl: string, width: number, height: number): Content {
  return {
    image: dataUrl,
    fit: [width, height],
    alignment: "center",
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

/** Grid of fitted images (2×2 — 4 per page, kept together with unbreakable). */
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
          ? gridImageBlock(data, cellWidth, cellHeight)
          : emptyGridCell(cellHeight);
      return {
        stack: [imageContent],
        margin: [2, 2, 2, 2] as [number, number, number, number],
      } satisfies Content;
    }),
  );

  const rows: Content[][] = chunk(cells, columns).map((row) => {
    const padded: Content[] = [...row];
    while (padded.length < columns) padded.push({ text: "" } as Content);
    return padded;
  });

  return {
    table: {
      widths: Array(columns).fill("*"),
      heights: Array(rows.length).fill(cellHeight + 4),
      body: rows,
    },
    layout: "noBorders",
    margin: [0, 0, 0, 8] as [number, number, number, number],
    unbreakable: true,
  };
}

/** 2×2 grid matching product images — fitted image with comment under each site photo. */
async function buildSitePhotoGrid(photos: OrderQuotationPhoto[]): Promise<Content> {
  const rowHeight = SITE_IMAGE_CELL_H + IMAGE_COMMENT_BLOCK + 4;
  const cards = await Promise.all(
    photos.map(async (entry) => {
      const url = entry.imageUrl!.trim();
      const data = await embedImage(url);
      const imageContent =
        data && isPdfSafeDataUrl(data)
          ? gridImageBlock(data, IMAGE_CELL_W, SITE_IMAGE_CELL_H)
          : emptyGridCell(SITE_IMAGE_CELL_H);
      return {
        stack: [
          imageContent,
          {
            text: entry.comment?.trim() || "—",
            fontSize: 8,
            color: "#444444",
            margin: [0, 2, 0, 0] as [number, number, number, number],
          },
        ],
        margin: [2, 2, 2, 2] as [number, number, number, number],
      } satisfies Content;
    }),
  );

  const rows: Content[][] = chunk(cards, IMAGE_GRID_COLS).map((row) => {
    const padded: Content[] = [...row];
    while (padded.length < IMAGE_GRID_COLS) padded.push({ text: "" } as Content);
    return padded;
  });

  return {
    table: {
      widths: Array(IMAGE_GRID_COLS).fill("*"),
      heights: Array(rows.length).fill(rowHeight),
      body: rows,
    },
    layout: "noBorders",
    margin: [0, 0, 0, 8] as [number, number, number, number],
    unbreakable: true,
  };
}

async function buildCompanyHeader(settings?: QuotationCompanySettings): Promise<Content[]> {
  const lines: Content[] = [];
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
    { label: "Date", value: formatDisplayDate(order.createdAt) },
    { label: "Items", value: String(order.items.length) },
  ];
  if (order.deliveryDate?.trim()) {
    left.push({ label: "Delivery", value: formatDisplayDate(order.deliveryDate) });
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
      { text: formatInr(rate), fontSize: 8.5, alignment: "right" as const },
      { text: formatInr(item.totalPrice), fontSize: 8.5, alignment: "right" as const },
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
  const deliveryCharge = roundMoney(Number(order.deliveryCharge ?? 0));
  const subtotal = roundMoney(order.totalAmount);
  const total = roundMoney(subtotal + deliveryCharge);
  const balance = Math.max(0, subtotal - (order.paidAmount ?? 0));
  const rows: Content[][] = [];

  rows.push([
    {
      text: order.isGst ? "Subtotal (incl. GST)" : "Subtotal",
      fontSize: 8.5,
    },
    { text: formatInr(subtotal), fontSize: 8.5, alignment: "right" },
  ]);
  rows.push([
    { text: "Delivery charge", fontSize: 8.5 },
    { text: formatInr(deliveryCharge), fontSize: 8.5, alignment: "right" },
  ]);
  rows.push([
    { text: "Order Total", bold: true, fontSize: 9 },
    { text: formatInr(total), bold: true, fontSize: 9, alignment: "right" },
  ]);
  if ((order.paidAmount ?? 0) > 0) {
    rows.push([
      { text: "Paid", fontSize: 8.5 },
      { text: formatInr(order.paidAmount!), fontSize: 8.5, alignment: "right" },
    ]);
    rows.push([
      { text: "Balance Due", fontSize: 8.5 },
      { text: formatInr(balance), fontSize: 8.5, alignment: "right" },
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

async function buildFullWidthImageStack(urls: string[]): Promise<Content> {
  const items = await Promise.all(
    urls.map(async (url) => {
      const data = await embedImage(url);
      const imageContent =
        data && isPdfSafeDataUrl(data)
          ? containImageBlock(data, PDF_CONTENT_WIDTH, CHALLAN_IMAGE_HEIGHT)
          : emptyGridCell(CHALLAN_IMAGE_HEIGHT);
      return {
        stack: [imageContent],
        margin: [0, 0, 0, 8] as [number, number, number, number],
      } satisfies Content;
    }),
  );
  return { stack: items };
}

async function buildChallanImagesSection(urls: string[]): Promise<Content[]> {
  const withImage = urls.map((u) => u.trim()).filter(Boolean);
  if (withImage.length === 0) return [];

  return [
    { text: "Challan images", style: "sectionTitle" },
    await buildFullWidthImageStack(withImage),
  ];
}

async function buildProductImagesSection(order: OrderQuotationInput): Promise<Content[]> {
  const labeledUrls: { label: string; url: string }[] = [];
  for (const item of order.items) {
    for (const url of item.imageUrls) {
      if (url.trim()) labeledUrls.push({ label: item.label, url: url.trim() });
    }
  }
  if (labeledUrls.length === 0) return [];

  const blocks: Content[] = [
    { text: "Product images", style: "sectionTitle", pageBreak: "before" as const },
  ];
  const pages = chunk(labeledUrls, IMAGES_PER_PAGE);

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const pageItems = pages[pageIndex];
    if (pageIndex > 0) {
      blocks.push({ text: "", pageBreak: "before" as const });
    }

    const labels = [...new Set(pageItems.map((item) => item.label))];
    if (labels.length === 1) {
      blocks.push({ text: labels[0], bold: true, fontSize: 8.5, margin: [0, 0, 0, 2] });
    } else if (labels.length > 1) {
      blocks.push({
        text: labels.join(" · "),
        bold: true,
        fontSize: 8.5,
        margin: [0, 0, 0, 2],
      });
    }

    blocks.push(
      await buildCoverImageGrid(
        pageItems.map((item) => item.url),
        IMAGE_GRID_COLS,
        IMAGE_CELL_W,
        PRODUCT_IMAGE_CELL_H,
      ),
    );
  }

  return blocks;
}

async function buildSitePhotosSection(photos: OrderQuotationPhoto[]): Promise<Content[]> {
  const withImage = photos.filter((p) => p.imageUrl?.trim());
  if (withImage.length === 0) return [];

  const blocks: Content[] = [
    { text: "Site photos & comments", style: "sectionTitle", pageBreak: "before" as const },
  ];
  const pages = chunk(withImage, IMAGES_PER_PAGE);

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    if (pageIndex > 0) {
      blocks.push({ text: "", pageBreak: "before" as const });
    }
    blocks.push(await buildSitePhotoGrid(pages[pageIndex]));
  }

  return blocks;
}

export async function buildOrderQuotationDocument(
  order: OrderQuotationInput,
  settings?: QuotationCompanySettings,
): Promise<TDocumentDefinitions> {
  embeddedImageCount = 0;

  const content: Content[] = [
    ...(await buildCompanyHeader(settings)),
    { text: "Order Quotation", style: "docTitle" },
    { text: "Order details", style: "sectionTitle" },
    buildCompactOrderDetails(order),
    { text: "Order items", style: "sectionTitle" },
    buildLineItemsTable(order),
    buildPriceSummary(order),
    ...(await buildChallanImagesSection(order.challanImageUrls)),
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
  const deliveryCharge = roundMoney(Number(order.deliveryCharge ?? 0));
  const subtotal = roundMoney(order.totalAmount);
  const total = roundMoney(subtotal + deliveryCharge);
  const balance = Math.max(0, subtotal - (order.paidAmount ?? 0));
  const lines = [
    `*${company} — Quotation*`,
    "",
    `Order: *${order.orderNumber}*`,
    `Customer: ${order.customerName}`,
    order.customerMobile?.trim() ? `Mobile: ${order.customerMobile.trim()}` : "",
    "",
    `Subtotal: ${formatInr(subtotal)}`,
    `Delivery charge: ${formatInr(deliveryCharge)}`,
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
  const filename = `Quotation_${safeName}.pdf`;
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
