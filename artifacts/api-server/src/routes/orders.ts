import { Router, IRouter } from "express";
import { db, ordersTable, orderItemsTable, productsTable, inventoryLogsTable, invoicesTable, settingsTable, branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateOrderBody, UpdateOrderBody, UpdateOrderStatusBody, GetOrderParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function generateOrderNumber() {
  return `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function enrichOrder(order: any) {
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
  const enrichedItems = await Promise.all(items.map(async (item) => {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    return {
      ...item,
      unitPrice: parseFloat(item.unitPrice),
      gstPercent: parseFloat(item.gstPercent),
      totalPrice: parseFloat(item.totalPrice),
      product: product ? { ...product, price: parseFloat(product.price), gstPercent: parseFloat(product.gstPercent) } : null,
    };
  }));
  let branch = null;
  if (order.branchId) {
    const [b] = await db.select().from(branchesTable).where(eq(branchesTable.id, order.branchId));
    if (b) branch = b;
  }
  return {
    ...order,
    subtotal: parseFloat(order.subtotal),
    taxAmount: parseFloat(order.taxAmount),
    totalAmount: parseFloat(order.totalAmount),
    paidAmount: parseFloat(order.paidAmount),
    items: enrichedItems,
    branch,
  };
}

router.get("/orders", requireAuth, async (req, res): Promise<void> => {
  const { search, status, isGst, branchId, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let orders = await db.select().from(ordersTable).offset(offset).limit(limitNum);
  if (search) orders = orders.filter(o => o.customerName.toLowerCase().includes(search.toLowerCase()) || o.orderNumber.includes(search));
  if (status) orders = orders.filter(o => o.status === status);
  if (isGst !== undefined) orders = orders.filter(o => o.isGst === (isGst === "true"));
  if (branchId) orders = orders.filter(o => o.branchId === parseInt(branchId, 10));

  const data = await Promise.all(orders.map(enrichOrder));
  res.json({ data, total: data.length, page: pageNum, limit: limitNum });
});

router.post("/orders", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { items, ...orderData } = parsed.data;
  let subtotal = 0;
  let taxAmount = 0;

  const resolvedItems: any[] = [];
  for (const item of items) {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    if (!product) { res.status(400).json({ error: `Product ${item.productId} not found` }); return; }
    const gstPercent = orderData.isGst ? parseFloat(product.gstPercent) : 0;
    const itemSubtotal = item.unitPrice * item.quantity;
    const itemTax = (itemSubtotal * gstPercent) / 100;
    subtotal += itemSubtotal;
    taxAmount += itemTax;
    resolvedItems.push({ ...item, gstPercent, totalPrice: itemSubtotal + itemTax });
  }

  const totalAmount = subtotal + taxAmount;
  const orderNumber = generateOrderNumber();

  const [order] = await db.insert(ordersTable).values({
    ...orderData,
    orderNumber,
    subtotal: String(subtotal),
    taxAmount: String(taxAmount),
    totalAmount: String(totalAmount),
    paidAmount: "0",
  }).returning();

  for (const item of resolvedItems) {
    await db.insert(orderItemsTable).values({
      orderId: order.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: String(item.unitPrice),
      gstPercent: String(item.gstPercent),
      totalPrice: String(item.totalPrice),
    });
    // Reduce stock
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    if (product) {
      await db.update(productsTable).set({ stockQty: Math.max(0, product.stockQty - item.quantity) }).where(eq(productsTable.id, item.productId));
      await db.insert(inventoryLogsTable).values({ productId: item.productId, type: "out", quantity: item.quantity, notes: `Order ${orderNumber}` });
    }
  }

  // Auto-generate invoice
  const [settings] = await db.select().from(settingsTable);
  const invoicePrefix = settings?.invoicePrefix || "INV";
  const invoiceNumber = `${invoicePrefix}-${Date.now()}`;
  const cgst = orderData.isGst ? taxAmount / 2 : 0;
  const sgst = orderData.isGst ? taxAmount / 2 : 0;

  await db.insert(invoicesTable).values({
    invoiceNumber,
    orderId: order.id,
    isGst: orderData.isGst,
    cgst: String(cgst),
    sgst: String(sgst),
    igst: "0",
    totalAmount: String(totalAmount),
  });

  res.status(201).json(await enrichOrder(order));
});

router.get("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(await enrichOrder(order));
});

router.put("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [order] = await db.update(ordersTable).set(parsed.data).where(eq(ordersTable.id, id)).returning();
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(await enrichOrder(order));
});

router.delete("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [order] = await db.delete(ordersTable).where(eq(ordersTable.id, id)).returning();
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.json({ success: true });
});

router.patch("/orders/:id/status", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateOrderStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [order] = await db.update(ordersTable).set({ status: parsed.data.status }).where(eq(ordersTable.id, id)).returning();
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(await enrichOrder(order));
});

export default router;
