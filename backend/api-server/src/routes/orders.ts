import { Router, IRouter } from "express";
import { CreateOrderBody, UpdateOrderBody, UpdateOrderStatusBody, GetOrderParams } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma, toNumber } from "../lib/prisma";
import { decrementProductStock, incrementProductStock } from "../lib/product-stock";

const router: IRouter = Router();

function generateOrderNumber() {
  return `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function enrichOrder(order: any) {
  const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
  const enrichedItems = await Promise.all(items.map(async (item) => {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    return {
      ...item,
      unitPrice: toNumber(item.unitPrice),
      gstPercent: toNumber(item.gstPercent),
      totalPrice: toNumber(item.totalPrice),
      product: product ? { ...product, price: toNumber(product.price), gstPercent: toNumber(product.gstPercent) } : null,
    };
  }));
  let branch: Awaited<ReturnType<typeof prisma.branch.findUnique>> = null;
  if (order.branchId) {
    const b = await prisma.branch.findUnique({ where: { id: order.branchId } });
    if (b) branch = b;
  }
  return {
    ...order,
    subtotal: toNumber(order.subtotal),
    taxAmount: toNumber(order.taxAmount),
    totalAmount: toNumber(order.totalAmount),
    paidAmount: toNumber(order.paidAmount),
    items: enrichedItems,
    branch,
  };
}

router.get("/orders", requireAuth, requirePermission("orders", "read"), async (req, res): Promise<void> => {
  const { search, status, isGst, branchId, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let orders = await prisma.order.findMany({ skip: offset, take: limitNum });
  if (search) orders = orders.filter(o => o.customerName.toLowerCase().includes(search.toLowerCase()) || o.orderNumber.includes(search));
  if (status) orders = orders.filter(o => o.status === status);
  if (isGst !== undefined) orders = orders.filter(o => o.isGst === (isGst === "true"));
  if (branchId) orders = orders.filter(o => o.branchId === parseInt(branchId, 10));

  const data = await Promise.all(orders.map(enrichOrder));
  res.json({ data, total: data.length, page: pageNum, limit: limitNum });
});

router.post("/orders", requireAuth, requirePermission("orders", "create"), async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { items, ...orderData } = parsed.data;
  let subtotal = 0;
  let taxAmount = 0;

  const resolvedItems: any[] = [];
  for (const item of items) {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product) { res.status(400).json({ error: `Product ${item.productId} not found` }); return; }
      const gstPercent = orderData.isGst ? toNumber(product.gstPercent) : 0;
    const itemSubtotal = item.unitPrice * item.quantity;
    const itemTax = (itemSubtotal * gstPercent) / 100;
    subtotal += itemSubtotal;
    taxAmount += itemTax;
    resolvedItems.push({ ...item, gstPercent, totalPrice: itemSubtotal + itemTax });
  }

  const totalAmount = subtotal + taxAmount;
  const orderNumber = generateOrderNumber();

  let createdOrder;
  try {
    createdOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          ...orderData,
          orderNumber,
          subtotal: String(subtotal),
          taxAmount: String(taxAmount),
          totalAmount: String(totalAmount),
          paidAmount: "0",
        },
      });

      for (const item of resolvedItems) {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: String(item.unitPrice),
            gstPercent: String(item.gstPercent),
            totalPrice: String(item.totalPrice),
          },
        });
        await decrementProductStock(item.productId, item.quantity, tx);
        await tx.inventoryLog.create({
          data: { productId: item.productId, type: "out", quantity: item.quantity, notes: `Order ${orderNumber}` },
        });
      }

      const settings = await tx.setting.findFirst();
      const invoicePrefix = settings?.invoicePrefix || "INV";
      const invoiceNumber = `${invoicePrefix}-${Date.now()}`;
      const cgst = orderData.isGst ? taxAmount / 2 : 0;
      const sgst = orderData.isGst ? taxAmount / 2 : 0;

      await tx.invoice.create({
        data: {
          invoiceNumber,
          orderId: order.id,
          isGst: orderData.isGst,
          cgst: String(cgst),
          sgst: String(sgst),
          igst: "0",
          totalAmount: String(totalAmount),
        },
      });

      return order;
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Insufficient stock across variants") {
      res.status(400).json({ error: "Insufficient stock for one or more products" });
      return;
    }
    res.status(500).json({ error: msg });
    return;
  }

  res.status(201).json(await enrichOrder(createdOrder));
});

router.get("/orders/:id", requireAuth, requirePermission("orders", "read"), async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const order = await prisma.order.findUnique({ where: { id: params.data.id } });
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(await enrichOrder(order));
});

router.put("/orders/:id", requireAuth, requirePermission("orders", "update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const existingOrder = await prisma.order.findUnique({ where: { id } });
  if (!existingOrder) { res.status(404).json({ error: "Order not found" }); return; }

  const existingItems = await prisma.orderItem.findMany({ where: { orderId: id } });
  const payload = parsed.data as any;
  const nextIsGst = payload.isGst ?? existingOrder.isGst;
  const nextItems = Array.isArray(payload.items)
    ? payload.items
    : existingItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: toNumber(item.unitPrice),
      }));

  let subtotal = 0;
  let taxAmount = 0;
  const resolvedItems: Array<{
    productId: number;
    quantity: number;
    unitPrice: number;
    gstPercent: number;
    totalPrice: number;
  }> = [];

  for (const item of nextItems) {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product) { res.status(400).json({ error: `Product ${item.productId} not found` }); return; }
    const gstPercent = nextIsGst ? toNumber(product.gstPercent) : 0;
    const itemSubtotal = item.unitPrice * item.quantity;
    const itemTax = (itemSubtotal * gstPercent) / 100;
    subtotal += itemSubtotal;
    taxAmount += itemTax;
    resolvedItems.push({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      gstPercent,
      totalPrice: itemSubtotal + itemTax,
    });
  }

  const totalAmount = subtotal + taxAmount;

  const previousQtyByProduct = new Map<number, number>();
  for (const item of existingItems) {
    previousQtyByProduct.set(item.productId, (previousQtyByProduct.get(item.productId) ?? 0) + item.quantity);
  }
  const nextQtyByProduct = new Map<number, number>();
  for (const item of resolvedItems) {
    nextQtyByProduct.set(item.productId, (nextQtyByProduct.get(item.productId) ?? 0) + item.quantity);
  }
  const productIds = new Set<number>([...previousQtyByProduct.keys(), ...nextQtyByProduct.keys()]);

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      for (const productId of productIds) {
        const previousQty = previousQtyByProduct.get(productId) ?? 0;
        const nextQty = nextQtyByProduct.get(productId) ?? 0;
        const delta = nextQty - previousQty;
        if (delta === 0) continue;

        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product) throw new Error(`Product ${productId} not found while updating stock`);

        if (delta > 0) {
          await decrementProductStock(productId, delta, tx);
          await tx.inventoryLog.create({
            data: {
              productId,
              type: "out",
              quantity: delta,
              notes: `Order ${existingOrder.orderNumber} updated`,
            },
          });
        } else {
          const returnQty = Math.abs(delta);
          await incrementProductStock(productId, returnQty, tx);
          await tx.inventoryLog.create({
            data: {
              productId,
              type: "in",
              quantity: returnQty,
              notes: `Order ${existingOrder.orderNumber} updated (restock)`,
            },
          });
        }
      }

      await tx.orderItem.deleteMany({ where: { orderId: id } });
      await tx.orderItem.createMany({
        data: resolvedItems.map((item) => ({
          orderId: id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: String(item.unitPrice),
          gstPercent: String(item.gstPercent),
          totalPrice: String(item.totalPrice),
        })),
      });

      const { items: _ignoredItems, ...orderFields } = payload;
      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          ...orderFields,
          subtotal: String(subtotal),
          taxAmount: String(taxAmount),
          totalAmount: String(totalAmount),
        },
      });

      const invoice = await tx.invoice.findFirst({ where: { orderId: id } });
      if (invoice) {
        const cgst = nextIsGst ? taxAmount / 2 : 0;
        const sgst = nextIsGst ? taxAmount / 2 : 0;
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            isGst: nextIsGst,
            cgst: String(cgst),
            sgst: String(sgst),
            igst: "0",
            totalAmount: String(totalAmount),
          },
        });
      }

      return updatedOrder;
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Insufficient stock across variants") {
      res.status(400).json({ error: "Insufficient stock for one or more products" });
      return;
    }
    res.status(400).json({ error: msg || "Failed to update order" });
    return;
  }

  res.json(await enrichOrder(order));
});

router.delete("/orders/:id", requireAuth, requirePermission("orders", "delete"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const order = await prisma.order.delete({ where: { id } }).catch(() => null);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.json({ success: true });
});

router.patch("/orders/:id/status", requireAuth, requirePermission("orders", "update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateOrderStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const order = await prisma.order.update({ where: { id }, data: { status: parsed.data.status } }).catch(() => null);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(await enrichOrder(order));
});

export default router;
