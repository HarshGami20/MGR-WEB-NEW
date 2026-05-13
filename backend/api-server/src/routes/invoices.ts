import { Router, IRouter } from "express";
import JSZip from "jszip";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma, toNumber } from "../lib/prisma";

const router: IRouter = Router();

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function getInvoiceDateRange(monthRaw: string | undefined, yearRaw: string | undefined): { gte: Date; lt: Date } | null {
  const month = parsePositiveInt(monthRaw);
  const year = parsePositiveInt(yearRaw);
  if (!month || !year || month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { gte: start, lt: end };
}

function buildInvoiceWhere(query: Record<string, string>) {
  const where: any = {};
  const orderId = parsePositiveInt(query.orderId);
  if (orderId) where.orderId = orderId;
  const branchId = parsePositiveInt(query.branchId);
  if (branchId) {
    where.order = { branchId };
  }
  const createdAt = getInvoiceDateRange(query.month, query.year);
  if (createdAt) where.createdAt = createdAt;
  return where;
}

function escapeCsvField(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, "\"\"")}"`;
}

async function enrichOrder(order: any) {
  const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
  const enrichedItems = await Promise.all(items.map(async (item) => {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    return { ...item, unitPrice: toNumber(item.unitPrice), gstPercent: toNumber(item.gstPercent), totalPrice: toNumber(item.totalPrice), product: product ? { ...product, price: toNumber(product.price), gstPercent: toNumber(product.gstPercent) } : null };
  }));
  return { ...order, subtotal: toNumber(order.subtotal), taxAmount: toNumber(order.taxAmount), totalAmount: toNumber(order.totalAmount), paidAmount: toNumber(order.paidAmount), items: enrichedItems };
}

router.get("/invoices", requireAuth, requirePermission("invoices", "read"), async (req, res): Promise<void> => {
  const { page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;
  const where = buildInvoiceWhere(req.query as Record<string, string>);
  const [invoices, total] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      skip: offset,
      take: limitNum,
      orderBy: { createdAt: "desc" },
      include: { order: { select: { orderNumber: true, branchId: true, branch: { select: { id: true, name: true, code: true } } } } },
    }),
    prisma.invoice.count({ where }),
  ]);

  const data = invoices.map(i => ({
    ...i,
    cgst: toNumber(i.cgst),
    sgst: toNumber(i.sgst),
    igst: toNumber(i.igst),
    totalAmount: toNumber(i.totalAmount),
  }));
  res.json({ data, total, page: pageNum, limit: limitNum });
});

router.get("/invoices/export/zip", requireAuth, requirePermission("invoices", "read"), async (req, res): Promise<void> => {
  const where = buildInvoiceWhere(req.query as Record<string, string>);
  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { order: { select: { orderNumber: true, customerName: true, branchId: true, branch: { select: { id: true, name: true, code: true } } } } },
  });

  const serialized = invoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    orderId: invoice.orderId,
    orderNumber: invoice.order?.orderNumber ?? "",
    customerName: invoice.order?.customerName ?? "",
    isGst: invoice.isGst,
    cgst: toNumber(invoice.cgst),
    sgst: toNumber(invoice.sgst),
    igst: toNumber(invoice.igst),
    totalAmount: toNumber(invoice.totalAmount),
    createdAt: invoice.createdAt,
  }));

  const csvHeader = [
    "id",
    "invoiceNumber",
    "orderId",
    "orderNumber",
    "customerName",
    "isGst",
    "cgst",
    "sgst",
    "igst",
    "totalAmount",
    "createdAt",
  ];
  const csvRows = serialized.map((row) =>
    [
      row.id,
      row.invoiceNumber,
      row.orderId,
      row.orderNumber,
      row.customerName,
      row.isGst,
      row.cgst,
      row.sgst,
      row.igst,
      row.totalAmount,
      row.createdAt.toISOString(),
    ]
      .map(escapeCsvField)
      .join(","),
  );
  const csvContent = [csvHeader.join(","), ...csvRows].join("\n");

  const zip = new JSZip();
  zip.file("invoices.json", JSON.stringify(serialized, null, 2));
  zip.file("invoices.csv", csvContent);
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

  const month = parsePositiveInt((req.query as Record<string, string>).month);
  const year = parsePositiveInt((req.query as Record<string, string>).year);
  const suffix = month && year ? `-${year}-${String(month).padStart(2, "0")}` : "-all";

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="invoices${suffix}.zip"`);
  res.send(zipBuffer);
});

router.get("/invoices/:id", requireAuth, requirePermission("invoices", "read"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  const order = await prisma.order.findUnique({ where: { id: invoice.orderId } });
  const enrichedOrder = order ? await enrichOrder(order) : null;
  res.json({
    ...invoice,
    cgst: toNumber(invoice.cgst),
    sgst: toNumber(invoice.sgst),
    igst: toNumber(invoice.igst),
    totalAmount: toNumber(invoice.totalAmount),
    order: enrichedOrder,
  });
});

export default router;
