import { Router, IRouter } from "express";
import { db, ordersTable, orderItemsTable, productsTable, suppliersTable, paymentsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (_req, res): Promise<void> => {
  const orders = await db.select().from(ordersTable);
  const products = await db.select().from(productsTable);
  const suppliers = await db.select().from(suppliersTable);
  const payments = await db.select().from(paymentsTable);

  const totalOrders = orders.length;
  const totalRevenue = orders.filter(o => o.status === "completed").reduce((sum, o) => sum + parseFloat(o.totalAmount), 0);
  const pendingOrders = orders.filter(o => o.status === "pending").length;
  const lowStockCount = products.filter(p => p.stockQty <= p.lowStockThreshold).length;
  const totalProducts = products.length;
  const totalSuppliers = suppliers.length;

  const totalPaid = orders.reduce((sum, o) => sum + parseFloat(o.paidAmount), 0);
  const totalRevs = orders.reduce((sum, o) => sum + parseFloat(o.totalAmount), 0);
  const pendingPayments = totalRevs - totalPaid;

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const completedOrdersToday = orders.filter(o => o.status === "completed" && new Date(o.updatedAt) >= startOfDay).length;

  res.json({
    totalOrders, totalRevenue, pendingOrders, lowStockCount, totalProducts, totalSuppliers, pendingPayments, completedOrdersToday
  });
});

router.get("/dashboard/recent-orders", requireAuth, async (req, res): Promise<void> => {
  const { limit = "10" } = req.query as Record<string, string>;
  const limitNum = parseInt(limit, 10);
  const orders = await db.select().from(ordersTable).limit(limitNum);
  const data = orders.map(o => ({
    ...o,
    subtotal: parseFloat(o.subtotal),
    taxAmount: parseFloat(o.taxAmount),
    totalAmount: parseFloat(o.totalAmount),
    paidAmount: parseFloat(o.paidAmount),
    items: [],
  }));
  res.json(data);
});

router.get("/dashboard/sales-report", requireAuth, async (req, res): Promise<void> => {
  const orders = await db.select().from(ordersTable);
  const year = req.query.year ? parseInt(req.query.year as string, 10) : new Date().getFullYear();

  const monthMap: Record<string, { revenue: number; orderCount: number }> = {};
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  for (const o of orders) {
    const d = new Date(o.createdAt);
    if (d.getFullYear() !== year) continue;
    const key = monthNames[d.getMonth()];
    if (!monthMap[key]) monthMap[key] = { revenue: 0, orderCount: 0 };
    monthMap[key].revenue += parseFloat(o.totalAmount);
    monthMap[key].orderCount += 1;
  }

  const result = monthNames.map(month => ({
    month,
    revenue: monthMap[month]?.revenue || 0,
    orderCount: monthMap[month]?.orderCount || 0,
  }));

  res.json(result);
});

router.get("/dashboard/order-status-breakdown", requireAuth, async (_req, res): Promise<void> => {
  const orders = await db.select().from(ordersTable);
  const statusMap: Record<string, number> = {};
  for (const o of orders) {
    statusMap[o.status] = (statusMap[o.status] || 0) + 1;
  }
  const result = Object.entries(statusMap).map(([status, count]) => ({ status, count }));
  res.json(result);
});

export default router;
