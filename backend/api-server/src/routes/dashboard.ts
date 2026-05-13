import { Router, IRouter, Request } from "express";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma, toNumber } from "../lib/prisma";

const router: IRouter = Router();

/** Optional `branchId` query: positive integer filters orders to that branch. */
function orderWhereFromQuery(req: Request): Prisma.OrderWhereInput {
  const raw = req.query.branchId;
  if (raw === undefined || raw === "") return {};
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return {};
  return { branchId: n };
}

router.get("/dashboard/summary", requireAuth, requirePermission("dashboard", "read"), async (req, res): Promise<void> => {
  const orderWhere = orderWhereFromQuery(req);
  const orders = await prisma.order.findMany({ where: orderWhere });
  const products = await prisma.product.findMany({ include: { _count: { select: { variants: true } } } });
  const suppliers = await prisma.supplier.findMany();

  const idsWithVariants = products.filter((p) => p._count.variants > 0).map((p) => p.id);
  const productLowFromVariant = new Set<number>();
  if (idsWithVariants.length) {
    const vrows = await prisma.productVariant.findMany({
      where: { productId: { in: idsWithVariants } },
      select: { productId: true, stockQty: true, lowStockThreshold: true },
    });
    for (const v of vrows) {
      if (v.stockQty <= v.lowStockThreshold) productLowFromVariant.add(v.productId);
    }
  }

  const totalOrders = orders.length;
  const totalRevenue = orders.filter((o) => o.status === "complete" || o.status === "delivered").reduce((sum, o) => sum + toNumber(o.totalAmount), 0);
  const pendingOrders = orders.filter((o) => o.status !== "complete" && o.status !== "delivered" && o.status !== "cancelled").length;
  const lowStockCount = products.filter((p) => {
    if (p._count.variants === 0) return p.stockQty <= p.lowStockThreshold;
    return productLowFromVariant.has(p.id);
  }).length;
  const totalProducts = products.length;
  const totalSuppliers = suppliers.length;

  const totalPaid = orders.reduce((sum, o) => sum + toNumber(o.paidAmount), 0);
  const totalRevs = orders.reduce((sum, o) => sum + toNumber(o.totalAmount), 0);
  const pendingPayments = totalRevs - totalPaid;

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const completedOrdersToday = orders.filter((o) => (o.status === "complete" || o.status === "delivered") && new Date(o.updatedAt) >= startOfDay).length;

  res.json({
    totalOrders, totalRevenue, pendingOrders, lowStockCount, totalProducts, totalSuppliers, pendingPayments, completedOrdersToday
  });
});

router.get("/dashboard/recent-orders", requireAuth, requirePermission("dashboard", "read"), async (req, res): Promise<void> => {
  const { limit = "10" } = req.query as Record<string, string>;
  const limitNum = parseInt(limit, 10);
  const orderWhere = orderWhereFromQuery(req);
  const orders = await prisma.order.findMany({
    where: orderWhere,
    take: limitNum,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const data = orders.map(o => ({
    ...o,
    subtotal: toNumber(o.subtotal),
    taxAmount: toNumber(o.taxAmount),
    totalAmount: toNumber(o.totalAmount),
    paidAmount: toNumber(o.paidAmount),
    items: [],
  }));
  res.json(data);
});

router.get("/dashboard/sales-report", requireAuth, requirePermission("dashboard", "read"), async (req, res): Promise<void> => {
  const orderWhere = orderWhereFromQuery(req);
  const orders = await prisma.order.findMany({ where: orderWhere });
  const year = req.query.year ? parseInt(req.query.year as string, 10) : new Date().getFullYear();

  const monthMap: Record<string, { revenue: number; orderCount: number }> = {};
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  for (const o of orders) {
    const d = new Date(o.createdAt);
    if (d.getFullYear() !== year) continue;
    const key = monthNames[d.getMonth()];
    if (!monthMap[key]) monthMap[key] = { revenue: 0, orderCount: 0 };
    monthMap[key].revenue += toNumber(o.totalAmount);
    monthMap[key].orderCount += 1;
  }

  const result = monthNames.map(month => ({
    month,
    revenue: monthMap[month]?.revenue || 0,
    orderCount: monthMap[month]?.orderCount || 0,
  }));

  res.json(result);
});

router.get("/dashboard/order-status-breakdown", requireAuth, requirePermission("dashboard", "read"), async (req, res): Promise<void> => {
  const orderWhere = orderWhereFromQuery(req);
  const orders = await prisma.order.findMany({ where: orderWhere });
  const statusMap: Record<string, number> = {};
  for (const o of orders) {
    statusMap[o.status] = (statusMap[o.status] || 0) + 1;
  }
  const result = Object.entries(statusMap).map(([status, count]) => ({ status, count }));
  res.json(result);
});

export default router;
