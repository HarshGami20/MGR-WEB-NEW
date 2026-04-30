import { Router, IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma, toNumber } from "../lib/prisma";

const router: IRouter = Router();

async function enrichOrder(order: any) {
  const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
  const enrichedItems = await Promise.all(items.map(async (item) => {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    return { ...item, unitPrice: toNumber(item.unitPrice), gstPercent: toNumber(item.gstPercent), totalPrice: toNumber(item.totalPrice), product: product ? { ...product, price: toNumber(product.price), gstPercent: toNumber(product.gstPercent) } : null };
  }));
  return { ...order, subtotal: toNumber(order.subtotal), taxAmount: toNumber(order.taxAmount), totalAmount: toNumber(order.totalAmount), paidAmount: toNumber(order.paidAmount), items: enrichedItems };
}

router.get("/invoices", requireAuth, requirePermission("invoices", "read"), async (req, res): Promise<void> => {
  const { orderId, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let invoices = await prisma.invoice.findMany({ skip: offset, take: limitNum });
  if (orderId) invoices = invoices.filter(i => i.orderId === parseInt(orderId, 10));

  const data = invoices.map(i => ({
    ...i,
    cgst: toNumber(i.cgst),
    sgst: toNumber(i.sgst),
    igst: toNumber(i.igst),
    totalAmount: toNumber(i.totalAmount),
  }));
  res.json({ data, total: data.length, page: pageNum, limit: limitNum });
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
