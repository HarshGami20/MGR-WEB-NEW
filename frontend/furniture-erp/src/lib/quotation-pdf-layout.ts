import type {
  Content,
  ContentImage,
  ContentTable,
  ContentText,
  CustomTableLayout,
  TableCell,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import { formatInr } from "@/lib/format-currency";
import { formatDisplayDate } from "@/lib/format-datetime";
import { inclusiveUnitFromExclusive, roundMoney } from "@/lib/gst-pricing";

export type OrderQuotationPhoto = {
  imageUrl?: string;
  comment?: string;
};

export type OrderQuotationLineItem = {
  label: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  gstPercent?: number;
  imageUrls: string[];
  /** Per-photo comments for custom line items. */
  photoComments?: OrderQuotationPhoto[];
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
  discountAmount?: number;
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

// ---- layout (keep in sync with MGR-CASA_APP/src/modules/orders/quotationPdfLayout.ts) ----

/** A JPEG/PNG data URL plus its pixel size, ready to embed in the PDF. */
export type QuotationPdfImage = {
  dataUrl: string;
  width: number;
  height: number;
};

export type QuotationPdfAssets = {
  /** Embedded images keyed by the URL used in the order input. Missing or null shows a placeholder. */
  images: ReadonlyMap<string, QuotationPdfImage | null>;
  logo?: QuotationPdfImage | null;
};

/** App brand palette (hue 223): navy band and titles, blue accents, light blue-grey surfaces. */
const THEME = {
  navy: "#12285E",
  primary: "#245CEB",
  text: "#0F1729",
  muted: "#5E6778",
  border: "#D6DEEC",
  headFill: "#F0F4FF",
  cellFill: "#F7F9FC",
  discount: "#166534",
};

const PAGE_WIDTH = 595.28;
const MARGIN_X = 40;
const MARGIN_TOP = 44;
const MARGIN_BOTTOM = 52;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const BAND_HEIGHT = 14;

const LOGO_BOX = { width: 150, height: 34 };
const CHALLAN_BOX = { width: 300, height: 240 };
const CHALLAN_PAD = 10;
const CARD_GAP = 12;
const CARD_PAD = 8;
const CARD_WIDTH = (CONTENT_WIDTH - CARD_GAP) / 2;
/** 130pt tall photo boxes fit 3 rows of 2 cards (6 photos) on each A4 page. */
const CARD_IMAGE_BOX = { width: CARD_WIDTH - CARD_PAD * 2 - 2, height: 130 };

type Margin = [number, number, number, number];

type GalleryCard = {
  url: string;
  label: string;
  /** undefined hides the comments row; empty string shows a dash. */
  comment?: string;
};

type GallerySection = {
  title: string;
  subtitle: string;
  cards: GalleryCard[];
};

function clean(value?: string | null): string {
  return value?.trim() ?? "";
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

function challanUrls(order: OrderQuotationInput): string[] {
  return order.challanImageUrls.map(clean).filter(Boolean);
}

function gallerySections(order: OrderQuotationInput): GallerySection[] {
  const productCards: GalleryCard[] = [];
  const customCards: GalleryCard[] = [];
  const customItemCount = order.items.filter((item) =>
    (item.photoComments ?? []).some((p) => clean(p.imageUrl)),
  ).length;

  for (const item of order.items) {
    const description = clean(item.description);
    const photos = (item.photoComments ?? []).filter((p) => clean(p.imageUrl));
    if (photos.length > 0) {
      photos.forEach((photo, index) => {
        customCards.push({
          url: clean(photo.imageUrl),
          label:
            customItemCount > 1 ? `${item.label} · Image ${index + 1}` : `Reference image ${index + 1}`,
          comment: clean(photo.comment) || description,
        });
      });
      continue;
    }
    const urls = item.imageUrls.map(clean).filter(Boolean);
    urls.forEach((url, index) => {
      productCards.push({
        url,
        label: urls.length > 1 ? `${item.label} · Image ${index + 1}` : item.label,
        comment: description || undefined,
      });
    });
  }

  const siteCards: GalleryCard[] = order.photoComments
    .filter((p) => clean(p.imageUrl))
    .map((p, index) => ({
      url: clean(p.imageUrl),
      label: `Site photo ${index + 1}`,
      comment: clean(p.comment),
    }));

  const sections: GallerySection[] = [];
  if (productCards.length > 0) {
    sections.push({
      title: "Product images",
      subtitle: "Catalogue photos of the quoted products.",
      cards: productCards,
    });
  }
  if (customCards.length > 0) {
    sections.push({
      title: "Custom item images & comments",
      subtitle:
        customItemCount > 1
          ? "Reference photos and supporting notes for the quoted custom items."
          : "Reference photos and supporting notes for the quoted custom item.",
      cards: customCards,
    });
  }
  if (siteCards.length > 0) {
    sections.push({
      title: "Site photos & comments",
      subtitle: "Photos and notes recorded for this order.",
      cards: siteCards,
    });
  }
  return sections;
}

/**
 * Every image URL the quotation shows, in page order and without duplicates.
 * Callers embed these (up to their own limit) and pass them back via `QuotationPdfAssets.images`.
 */
export function collectQuotationImageUrls(order: OrderQuotationInput): string[] {
  const urls = [
    ...challanUrls(order),
    ...gallerySections(order).flatMap((section) => section.cards.map((card) => card.url)),
  ];
  return [...new Set(urls)];
}

function fitSize(image: QuotationPdfImage, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

/** Image centred in a fixed box, or a placeholder when it could not be loaded. */
function imageInBox(
  image: QuotationPdfImage | null | undefined,
  boxWidth: number,
  boxHeight: number,
): ContentImage | ContentText {
  if (!image) {
    const gap = boxHeight / 2 - 5;
    return {
      text: "Image unavailable",
      fontSize: 8,
      color: THEME.muted,
      alignment: "center",
      margin: [0, gap, 0, gap] as Margin,
    };
  }
  const size = fitSize(image, boxWidth, boxHeight);
  const gap = (boxHeight - size.height) / 2;
  return {
    image: image.dataUrl,
    width: size.width,
    height: size.height,
    alignment: "center",
    margin: [0, gap, 0, gap] as Margin,
  };
}

function gridLayout(padX: number, padY: number): CustomTableLayout {
  return {
    hLineWidth: () => 0.75,
    vLineWidth: () => 0.75,
    hLineColor: () => THEME.border,
    vLineColor: () => THEME.border,
    paddingLeft: () => padX,
    paddingRight: () => padX,
    paddingTop: () => padY,
    paddingBottom: () => padY,
  };
}

function sectionHeading(text: string): Content {
  return {
    text,
    fontSize: 11.5,
    bold: true,
    color: THEME.navy,
    margin: [2, 14, 0, 7] as Margin,
  };
}

function buildBrandHeader(
  order: OrderQuotationInput,
  settings: QuotationCompanySettings | undefined,
  logo: QuotationPdfImage | null | undefined,
): Content[] {
  const companyName = clean(settings?.companyName);
  const brand: Content = logo
    ? { image: logo.dataUrl, ...fitSize(logo, LOGO_BOX.width, LOGO_BOX.height) }
    : { text: companyName || "MGR CASA", fontSize: 16, bold: true, color: THEME.navy };

  const contact: Content[] = [];
  if (logo && companyName) {
    contact.push({ text: companyName, bold: true, fontSize: 8.5, color: THEME.navy });
  }
  if (clean(settings?.address)) contact.push({ text: clean(settings?.address) });
  const reach = [
    clean(settings?.phone) ? `Ph: ${clean(settings?.phone)}` : "",
    clean(settings?.email),
  ].filter(Boolean);
  if (reach.length) contact.push({ text: reach.join("  ·  ") });
  if (clean(settings?.gstNumber)) contact.push({ text: `GSTIN: ${clean(settings?.gstNumber)}` });

  return [
    {
      columns: [
        { width: "*", stack: [brand] },
        { width: 250, stack: contact, alignment: "right", fontSize: 7.5, color: THEME.muted, lineHeight: 1.25 },
      ],
      columnGap: 16,
      margin: [0, 0, 0, 12] as Margin,
    },
    {
      columns: [
        {
          width: "*",
          text: "ORDER QUOTATION",
          fontSize: 22,
          bold: true,
          color: THEME.navy,
          characterSpacing: 0.3,
        },
        {
          width: 150,
          stack: [
            { text: "ORDER NO.", fontSize: 7.5, bold: true, color: THEME.muted, characterSpacing: 0.8 },
            { text: order.orderNumber, fontSize: 13, color: THEME.navy, margin: [0, 1, 0, 0] as Margin },
          ],
        },
      ],
      columnGap: 16,
    },
    {
      canvas: [
        { type: "line", x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 1.5, lineColor: THEME.primary },
      ],
      margin: [0, 10, 0, 0] as Margin,
    },
  ];
}

type DetailField = { label: string; value: string };

function detailCells(field: DetailField | undefined): TableCell[] {
  return [
    { text: field?.label ?? "", bold: true, fillColor: THEME.cellFill },
    { text: field?.value ?? "", fillColor: THEME.cellFill },
  ];
}

function buildOrderDetails(order: OrderQuotationInput): Content {
  const left: DetailField[] = [
    { label: "Order", value: order.orderNumber },
    { label: "Date", value: formatDisplayDate(order.createdAt) },
    { label: "Items", value: String(order.items.length) },
  ];
  if (order.isGst && clean(order.customerGstNumber)) {
    left.push({ label: "GSTIN", value: clean(order.customerGstNumber) });
  }

  const right: DetailField[] = [{ label: "Customer", value: order.customerName }];
  if (clean(order.customerMobile)) right.push({ label: "Mobile", value: clean(order.customerMobile) });
  if (clean(order.deliveryDate)) {
    right.push({ label: "Delivery", value: formatDisplayDate(clean(order.deliveryDate)) });
  }

  const body: TableCell[][] = [];
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    body.push([...detailCells(left[i]), ...detailCells(right[i])]);
  }

  const address = [clean(order.customerAddress), clean(order.customerPincode) ? `PIN ${clean(order.customerPincode)}` : ""]
    .filter(Boolean)
    .join(", ");
  if (address) {
    body.push([
      { text: "Address", bold: true, fillColor: THEME.cellFill },
      { text: address, colSpan: 3, fillColor: THEME.cellFill },
      {},
      {},
    ]);
  }

  return {
    table: { widths: [64, "*", 64, "*"], body },
    layout: gridLayout(8, 7),
    fontSize: 8.5,
  };
}

function buildItemsTable(order: OrderQuotationInput): Content {
  const head = (text: string, right = false): TableCell => ({
    text,
    bold: true,
    fillColor: THEME.headFill,
    alignment: right ? "right" : "left",
  });
  const header: TableCell[] = [
    head("Item description"),
    head("Qty", true),
    head(order.isGst ? "Rate (incl. GST)" : "Rate", true),
    head("Amount", true),
  ];

  const rows: TableCell[][] = order.items.map((item) => {
    const rate =
      order.isGst && (item.gstPercent ?? 0) > 0
        ? inclusiveUnitFromExclusive(item.unitPrice, item.gstPercent!)
        : item.unitPrice;
    const description = clean(item.description);
    const labelCell: TableCell = description
      ? {
          stack: [
            { text: item.label, bold: true },
            { text: description, fontSize: 7.5, color: THEME.muted, margin: [0, 2, 0, 0] as Margin },
          ],
        }
      : { text: item.label };
    return [
      labelCell,
      { text: String(item.quantity), alignment: "right" },
      { text: formatInr(rate), alignment: "right" },
      { text: formatInr(item.totalPrice), alignment: "right" },
    ];
  });

  return {
    table: { headerRows: 1, dontBreakRows: true, widths: ["*", 44, 84, 88], body: [header, ...rows] },
    layout: gridLayout(8, 7),
    fontSize: 9,
  };
}

type TotalRow = {
  label: string;
  value: string;
  tone?: "total" | "balance" | "discount";
};

function buildTotals(order: OrderQuotationInput): Content {
  const lineSubtotal = roundMoney(Number(order.subtotal ?? 0));
  const taxAmount = roundMoney(Number(order.taxAmount ?? 0));
  const itemsTotal = roundMoney(lineSubtotal + taxAmount);
  const deliveryCharge = roundMoney(Number(order.deliveryCharge ?? 0));
  const discountAmount = roundMoney(Number(order.discountAmount ?? 0));
  const total = roundMoney(Number(order.totalAmount));
  const paid = Number(order.paidAmount ?? 0);
  const balance = Math.max(0, total - paid);

  const rows: TotalRow[] = [
    { label: order.isGst ? "Subtotal (incl. GST)" : "Subtotal", value: formatInr(itemsTotal) },
    { label: "Delivery charge", value: formatInr(deliveryCharge) },
  ];
  if (discountAmount > 0) {
    rows.push({ label: "Discount", value: `-${formatInr(discountAmount)}`, tone: "discount" });
  }
  rows.push({ label: "Order total", value: formatInr(total), tone: "total" });
  if (paid > 0) {
    rows.push({ label: "Paid", value: formatInr(paid) });
    rows.push({ label: "Balance due", value: formatInr(balance), tone: "balance" });
  }

  const totalIndex = rows.findIndex((r) => r.tone === "total");
  const balanceIndex = rows.findIndex((r) => r.tone === "balance");

  const body: TableCell[][] = rows.map((row) => {
    const emphasis = row.tone === "total" || row.tone === "balance";
    const fillColor =
      row.tone === "total" ? THEME.headFill : row.tone === "balance" ? THEME.cellFill : undefined;
    const fontSize = row.tone === "total" ? 10 : emphasis ? 9.5 : 9;
    const color = row.tone === "discount" ? THEME.discount : THEME.text;
    return [
      { text: row.label, bold: emphasis, fontSize, fillColor },
      { text: row.value, bold: emphasis, fontSize, fillColor, color, alignment: "right" },
    ];
  });

  return {
    stack: [
      {
        table: { widths: ["*", 120], body },
        layout: {
          hLineWidth: (i) => (i === totalIndex ? 1 : i === balanceIndex ? 0.75 : 0),
          hLineColor: (i) => (i === totalIndex ? THEME.primary : THEME.border),
          vLineWidth: () => 0,
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
      } satisfies ContentTable,
    ],
    unbreakable: true,
    margin: [0, 6, 0, 0] as Margin,
  };
}

function buildChallanSection(order: OrderQuotationInput, assets: QuotationPdfAssets): Content[] {
  const urls = challanUrls(order);
  if (urls.length === 0) return [];

  const cardWidth = CHALLAN_BOX.width + CHALLAN_PAD * 2;
  const cards: Content[] = urls.map((url) => ({
    table: {
      widths: [CHALLAN_BOX.width],
      body: [
        [
          {
            ...imageInBox(assets.images.get(url), CHALLAN_BOX.width, CHALLAN_BOX.height),
            fillColor: THEME.cellFill,
          },
        ],
      ],
    },
    layout: gridLayout(CHALLAN_PAD, CHALLAN_PAD),
    margin: [(CONTENT_WIDTH - cardWidth) / 2, 0, 0, 8] as Margin,
  }));

  const heading = sectionHeading(urls.length > 1 ? "Challan images" : "Challan image");
  return [
    { stack: [heading, cards[0]], unbreakable: true },
    ...cards.slice(1).map((card): Content => ({ stack: [card], unbreakable: true })),
  ];
}

function galleryCard(card: GalleryCard, assets: QuotationPdfAssets): Content {
  const body: TableCell[][] = [
    [
      {
        ...imageInBox(assets.images.get(card.url), CARD_IMAGE_BOX.width, CARD_IMAGE_BOX.height),
        fillColor: THEME.cellFill,
      },
    ],
    [{ text: card.label, bold: true, fontSize: 9 }],
  ];
  if (card.comment !== undefined) {
    body.push([
      {
        text: [
          { text: "Description / comments: ", color: THEME.text },
          { text: card.comment || "—" },
        ],
        fontSize: 8,
        color: THEME.muted,
      },
    ]);
  }
  return {
    table: { widths: ["*"], body },
    layout: {
      ...gridLayout(CARD_PAD, 7),
      paddingTop: (i) => (i === 0 ? CARD_PAD : 7),
      paddingBottom: (i) => (i === 0 ? CARD_PAD : 7),
    },
  };
}

function buildGallerySection(section: GallerySection, assets: QuotationPdfAssets): Content[] {
  const half = CARD_GAP / 2;
  const rows: TableCell[][] = chunk(section.cards, 2).map(([first, second]) => [
    { stack: [galleryCard(first, assets)], margin: [0, 0, half, CARD_GAP] as Margin },
    second
      ? { stack: [galleryCard(second, assets)], margin: [half, 0, 0, CARD_GAP] as Margin }
      : { text: "" },
  ]);

  return [
    {
      text: section.title.toUpperCase(),
      fontSize: 20,
      bold: true,
      color: THEME.navy,
      pageBreak: "before",
      margin: [0, 4, 0, 2] as Margin,
    },
    { text: section.subtitle, fontSize: 9, color: THEME.muted, margin: [0, 0, 0, 14] as Margin },
    {
      table: { widths: ["*", "*"], dontBreakRows: true, body: rows },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
    },
  ];
}

/** Quotation PDF definition (pure — images are loaded by the caller). */
export function buildQuotationDocument(
  order: OrderQuotationInput,
  settings: QuotationCompanySettings | undefined,
  assets: QuotationPdfAssets,
): TDocumentDefinitions {
  const companyName = clean(settings?.companyName) || "MGR CASA";
  const content: Content[] = [
    ...buildBrandHeader(order, settings, assets.logo),
    sectionHeading("Order details"),
    buildOrderDetails(order),
    sectionHeading("Order items"),
    buildItemsTable(order),
    buildTotals(order),
    ...buildChallanSection(order, assets),
    ...gallerySections(order).flatMap((section) => buildGallerySection(section, assets)),
  ];

  return {
    pageSize: "A4",
    pageMargins: [MARGIN_X, MARGIN_TOP, MARGIN_X, MARGIN_BOTTOM],
    info: { title: `Quotation ${order.orderNumber}`, author: companyName, subject: "Order quotation" },
    background: (_page, pageSize) => ({
      canvas: [{ type: "rect", x: 0, y: 0, w: pageSize.width, h: BAND_HEIGHT, color: THEME.navy }],
    }),
    footer: (currentPage, pageCount) => ({
      margin: [MARGIN_X, 18, MARGIN_X, 0] as Margin,
      stack: [
        {
          canvas: [
            { type: "line", x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 0.5, lineColor: THEME.border },
          ],
        },
        {
          columns: [
            { text: "Computer-generated quotation • Subject to confirmation", width: "*" },
            { text: `Page ${currentPage} of ${pageCount}`, width: "auto", alignment: "right" },
          ],
          fontSize: 7.5,
          color: THEME.muted,
          margin: [0, 7, 0, 0] as Margin,
        },
      ],
    }),
    content,
    defaultStyle: { font: "Roboto", fontSize: 9, color: THEME.text, lineHeight: 1.15 },
  };
}
