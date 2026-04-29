import { Router, IRouter } from "express";
import { db, invoicesTable, ordersTable, orderItemsTable, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

async function enrichOrder(order: any) {
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
  const enrichedItems = await Promise.all(items.map(async (item) => {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    return { ...item, unitPrice: parseFloat(item.unitPrice), gstPercent: parseFloat(item.gstPercent), totalPrice: parseFloat(item.totalPrice), product: product ? { ...product, price: parseFloat(product.price), gstPercent: parseFloat(product.gstPercent) } : null };
  }));
  return { ...order, subtotal: parseFloat(order.subtotal), taxAmount: parseFloat(order.taxAmount), totalAmount: parseFloat(order.totalAmount), paidAmount: parseFloat(order.paidAmount), items: enrichedItems };
}

router.get("/invoices", requireAuth, async (req, res): Promise<void> => {
  const { orderId, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let invoices = await db.select().from(invoicesTable).offset(offset).limit(limitNum);
  if (orderId) invoices = invoices.filter(i => i.orderId === parseInt(orderId, 10));

  const data = invoices.map(i => ({
    ...i,
    cgst: parseFloat(i.cgst),
    sgst: parseFloat(i.sgst),
    igst: parseFloat(i.igst),
    totalAmount: parseFloat(i.totalAmount),
  }));
  res.json({ data, total: data.length, page: pageNum, limit: limitNum });
});

router.get("/invoices/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, invoice.orderId));
  const enrichedOrder = order ? await enrichOrder(order) : null;
  res.json({
    ...invoice,
    cgst: parseFloat(invoice.cgst),
    sgst: parseFloat(invoice.sgst),
    igst: parseFloat(invoice.igst),
    totalAmount: parseFloat(invoice.totalAmount),
    order: enrichedOrder,
  });
});

export default router;
