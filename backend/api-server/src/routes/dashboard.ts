import { Router, IRouter, Request } from "express";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "../middlewares/auth";
import { requirePermission, requirePermissionAny } from "../lib/permissions";
import { prisma, toNumber } from "../lib/prisma";
import { readBranchIdFromRequest } from "../lib/branch-scope";
import { isCancelledOrderStatus, revenueReportingOrderWhere } from "../lib/order-reporting";

const router: IRouter = Router();

const dashboardRead = requirePermissionAny([
  { module: "dashboard", action: "read" },
  { module: "orders", action: "read" },
]);

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Branch from `branchId` query or `X-Branch-Id` header (mobile workspace). */
function orderWhereFromQuery(req: Request): Prisma.OrderWhereInput {
  const n = readBranchIdFromRequest(req);
  if (n == null || n <= 0) return {};
  return { branchId: n };
}

const COMPLETED_STATUSES = ["delivered", "complete"];

router.get("/dashboard/summary", requireAuth, dashboardRead, async (req, res): Promise<void> => {
  const orderWhere = orderWhereFromQuery(req);
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // Totals are computed in the database (a handful of grouped rows) instead of loading every order.
  const [statusRows, completedOrdersToday, totalProducts, lowSimpleProducts, lowVariantProducts, totalSuppliers] =
    await Promise.all([
      prisma.order.groupBy({
        by: ["status"],
        where: orderWhere,
        _count: { _all: true },
        _sum: { totalAmount: true, paidAmount: true },
      }),
      prisma.order.count({
        where: { AND: [orderWhere, { status: { in: COMPLETED_STATUSES } }, { updatedAt: { gte: startOfDay } }] },
      }),
      prisma.product.count(),
      prisma.product.count({
        where: { variants: { none: {} }, stockQty: { lte: prisma.product.fields.lowStockThreshold } },
      }),
      prisma.productVariant.groupBy({
        by: ["productId"],
        where: { stockQty: { lte: prisma.productVariant.fields.lowStockThreshold } },
      }),
      prisma.supplier.count(),
    ]);

  let totalOrders = 0;
  let totalRevenue = 0;
  let pendingOrders = 0;
  let totalRevs = 0;
  let totalPaid = 0;
  for (const row of statusRows) {
    const count = row._count._all;
    const amount = toNumber(row._sum.totalAmount ?? 0);
    totalOrders += count;
    if (COMPLETED_STATUSES.includes(row.status)) totalRevenue += amount;
    if (!COMPLETED_STATUSES.includes(row.status) && row.status !== "cancelled") pendingOrders += count;
    if (!isCancelledOrderStatus(row.status)) {
      totalRevs += amount;
      totalPaid += toNumber(row._sum.paidAmount ?? 0);
    }
  }
  const pendingPayments = totalRevs - totalPaid;
  const lowStockCount = lowSimpleProducts + lowVariantProducts.length;

  res.json({
    totalOrders, totalRevenue, pendingOrders, lowStockCount, totalProducts, totalSuppliers, pendingPayments, completedOrdersToday
  });
});

router.get("/dashboard/recent-orders", requireAuth, dashboardRead, async (req, res): Promise<void> => {
  const { limit = "10" } = req.query as Record<string, string>;
  const limitNum = parseInt(limit, 10);
  const orderWhere = orderWhereFromQuery(req);
  const orders = await prisma.order.findMany({
    where: orderWhere,
    take: limitNum,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const data = orders.map((o) => ({
    ...o,
    subtotal: toNumber(o.subtotal),
    taxAmount: toNumber(o.taxAmount),
    totalAmount: toNumber(o.totalAmount),
    paidAmount: toNumber(o.paidAmount),
    challanImages: safeJsonParse<string[]>(o.challanImages, []),
    photoComments: safeJsonParse<Array<{ imageUrl: string; comment?: string }>>(o.photoComments, []),
    staffComments: safeJsonParse<Array<{ comment: string; authorName?: string; createdAt: string }>>(
      o.staffComments,
      [],
    ),
    deliveryComments: safeJsonParse<Array<{ comment: string; authorName?: string; createdAt: string }>>(
      (o as { deliveryComments?: string | null }).deliveryComments,
      [],
    ),
    items: [],
  }));
  res.json(data);
});

router.get("/dashboard/sales-report", requireAuth, dashboardRead, async (req, res): Promise<void> => {
  const orderWhere = orderWhereFromQuery(req);
  const year = req.query.year ? parseInt(req.query.year as string, 10) : new Date().getFullYear();
  // Only load the requested year (previously every order ever was loaded and filtered in memory).
  const orders = await prisma.order.findMany({
    where: revenueReportingOrderWhere({
      AND: [orderWhere, { createdAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } }],
    }),
    select: { createdAt: true, totalAmount: true },
  });

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

router.get("/dashboard/order-status-breakdown", requireAuth, dashboardRead, async (req, res): Promise<void> => {
  const orderWhere = orderWhereFromQuery(req);
  const rows = await prisma.order.groupBy({ by: ["status"], where: orderWhere, _count: { _all: true } });
  res.json(rows.map((row) => ({ status: row.status, count: row._count._all })));
});

export default router;
