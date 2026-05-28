import { Router, IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { requirePermission, requirePermissionAny } from "../lib/permissions";
import { prisma, toNumber } from "../lib/prisma";
import { orderMatchesCategoryFilter, resolveCategoryFilterIds } from "../lib/category-filter";
import { buildCategoryRevenueMatrix } from "../lib/category-revenue-matrix";
import { buildOrderExportRows } from "../lib/order-export";
import { parseExportCreatedAt } from "../lib/export-date-filter";
import {
  buildInventoryLogExportRows,
  buildStockSnapshotExportRows,
  resolveInventoryExportCategoryIds,
} from "../lib/inventory-export";
import {
  buildProductExportRows,
  resolveProductExportCategoryIds,
} from "../lib/product-export";
import { ymdUtcDayEnd, ymdUtcDayStart } from "../lib/date-range";

const router: IRouter = Router();

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

router.get("/reports/revenue-summary", requireAuth, requirePermission("reports", "read"), async (req, res): Promise<void> => {
  const yearParam = req.query.year ? parseInt(String(req.query.year), 10) : undefined;
  const monthParam = req.query.month ? parseInt(String(req.query.month), 10) : undefined;
  const branchIdParam = req.query.branchId ? parseInt(String(req.query.branchId), 10) : NaN;
  const branchFilter =
    Number.isFinite(branchIdParam) && branchIdParam > 0 ? { branchId: branchIdParam } : {};
  const categoryIdParam =
    typeof req.query.categoryId === "string" ? parseInt(req.query.categoryId, 10) : NaN;
  const categoryIds = await resolveCategoryFilterIds(
    Number.isFinite(categoryIdParam) && categoryIdParam > 0 ? String(categoryIdParam) : undefined,
  );

  const hasValidYear = Number.isFinite(yearParam) && (yearParam as number) >= 2000 && (yearParam as number) <= 3000;
  const hasValidMonth = Number.isFinite(monthParam) && (monthParam as number) >= 1 && (monthParam as number) <= 12;

  const createdAtWhere: { gte?: Date; lt?: Date } = {};
  if (hasValidYear) {
    const y = yearParam as number;
    if (hasValidMonth) {
      const m = monthParam as number;
      createdAtWhere.gte = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
      createdAtWhere.lt = new Date(Date.UTC(y, m, 1, 0, 0, 0));
    } else {
      createdAtWhere.gte = new Date(Date.UTC(y, 0, 1, 0, 0, 0));
      createdAtWhere.lt = new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0));
    }
  }

  const orders = await prisma.order.findMany({
    where: {
      ...branchFilter,
      ...(createdAtWhere.gte || createdAtWhere.lt ? { createdAt: createdAtWhere } : {}),
      ...(categoryIds ? orderMatchesCategoryFilter(categoryIds) : {}),
    },
    select: {
      id: true,
      createdAt: true,
      categoryId: true,
      totalAmount: true,
      paidAmount: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const byYear = new Map<number, {
    year: number;
    totalRevenue: number;
    totalReceived: number;
    totalDue: number;
    totalOrders: number;
    months: Map<number, { month: number; monthLabel: string; revenue: number; received: number; due: number; orders: number }>;
  }>();
  const byDay = new Map<string, { date: string; day: number; revenue: number; received: number; due: number; orders: number }>();
  const byMonthPeriod = new Map<string, { revenue: number; received: number; due: number; orders: number }>();

  let overallRevenue = 0;
  let overallReceived = 0;
  let overallDue = 0;

  for (const order of orders) {
    const dt = new Date(order.createdAt);
    const year = dt.getFullYear();
    const month = dt.getMonth() + 1;
    const revenue = toNumber(order.totalAmount);
    const received = toNumber(order.paidAmount);
    const due = Math.max(0, revenue - received);
    overallRevenue += revenue;
    overallReceived += received;
    overallDue += due;

    if (!byYear.has(year)) {
      byYear.set(year, {
        year,
        totalRevenue: 0,
        totalReceived: 0,
        totalDue: 0,
        totalOrders: 0,
        months: new Map<number, { month: number; monthLabel: string; revenue: number; received: number; due: number; orders: number }>(),
      });
    }
    const yearRow = byYear.get(year)!;
    yearRow.totalRevenue += revenue;
    yearRow.totalReceived += received;
    yearRow.totalDue += due;
    yearRow.totalOrders += 1;

    if (!yearRow.months.has(month)) {
      yearRow.months.set(month, {
        month,
        monthLabel: MONTH_NAMES[month - 1],
        revenue: 0,
        received: 0,
        due: 0,
        orders: 0,
      });
    }
    const monthRow = yearRow.months.get(month)!;
    monthRow.revenue += revenue;
    monthRow.received += received;
    monthRow.due += due;
    monthRow.orders += 1;

    if (hasValidYear && hasValidMonth) {
      const dateKey = new Date(order.createdAt).toISOString().slice(0, 10);
      if (!byDay.has(dateKey)) {
        byDay.set(dateKey, {
          date: dateKey,
          day: dt.getUTCDate(),
          revenue: 0,
          received: 0,
          due: 0,
          orders: 0,
        });
      }
      const dayRow = byDay.get(dateKey)!;
      dayRow.revenue += revenue;
      dayRow.received += received;
      dayRow.due += due;
      dayRow.orders += 1;
    }

    if (hasValidYear && !hasValidMonth) {
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      if (!byMonthPeriod.has(monthKey)) {
        byMonthPeriod.set(monthKey, { revenue: 0, received: 0, due: 0, orders: 0 });
      }
      const mp = byMonthPeriod.get(monthKey)!;
      mp.revenue += revenue;
      mp.received += received;
      mp.due += due;
      mp.orders += 1;
    }
  }

  const yearly = Array.from(byYear.values())
    .sort((a, b) => a.year - b.year)
    .map((y) => {
      const months = Array.from(y.months.values()).sort((a, b) => a.month - b.month);
      return {
        year: y.year,
        totalRevenue: Number(y.totalRevenue.toFixed(2)),
        totalReceived: Number(y.totalReceived.toFixed(2)),
        totalDue: Number(y.totalDue.toFixed(2)),
        totalOrders: y.totalOrders,
        months: months.map((m) => ({
          ...m,
          revenue: Number(m.revenue.toFixed(2)),
          received: Number(m.received.toFixed(2)),
          due: Number(m.due.toFixed(2)),
        })),
      };
    });

  const daily =
    hasValidYear && hasValidMonth
      ? Array.from(byDay.values())
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((d) => ({
            ...d,
            revenue: Number(d.revenue.toFixed(2)),
            received: Number(d.received.toFixed(2)),
            due: Number(d.due.toFixed(2)),
          }))
      : [];

  const periodType: "day" | "month" =
    hasValidYear && hasValidMonth ? "day" : hasValidYear ? "month" : "month";

  let periodKeys: string[] = [];
  const periodLabels = new Map<string, string>();

  if (periodType === "day" && hasValidYear && hasValidMonth) {
    const y = yearParam as number;
    const m = monthParam as number;
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= daysInMonth; d += 1) {
      const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      periodKeys.push(key);
      periodLabels.set(key, `${d} ${MONTH_NAMES[m - 1]}`);
    }
  } else if (periodType === "month" && hasValidYear) {
    const y = yearParam as number;
    for (let m = 1; m <= 12; m += 1) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      periodKeys.push(key);
      periodLabels.set(key, MONTH_NAMES[m - 1]);
    }
  } else {
    periodKeys = ["total"];
    periodLabels.set("total", "Total");
  }

  const categoryWiseMatrix = await buildCategoryRevenueMatrix(orders, {
    periodType: periodKeys.length === 1 && periodKeys[0] === "total" ? "month" : periodType,
    periodKeys,
    periodLabels,
  });

  let categoryWise = categoryWiseMatrix.rows
    .map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      revenue: r.totalRevenue,
      orderItems: 0,
      quantity: 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  if (categoryIds) {
    categoryWise = categoryWise.filter(
      (c) => c.categoryId != null && categoryIds.includes(c.categoryId),
    );
    categoryWiseMatrix.rows = categoryWiseMatrix.rows.filter(
      (r) => r.categoryId != null && categoryIds.includes(r.categoryId),
    );
  }

  res.json({
    generatedAt: new Date().toISOString(),
    filters: {
      year: hasValidYear ? yearParam : null,
      month: hasValidMonth ? monthParam : null,
      branchId: Number.isFinite(branchIdParam) && branchIdParam > 0 ? branchIdParam : null,
      categoryId: Number.isFinite(categoryIdParam) && categoryIdParam > 0 ? categoryIdParam : null,
    },
    totals: {
      overallRevenue: Number(overallRevenue.toFixed(2)),
      overallReceived: Number(overallReceived.toFixed(2)),
      overallDue: Number(overallDue.toFixed(2)),
      totalOrders: orders.length,
      yearsCovered: yearly.length,
    },
    yearly,
    daily,
    categoryWise,
    categoryWiseMatrix,
  });
});

/** Full order rows for Excel export (filter: all | year | month | custom). */
router.get(
  "/reports/orders-export",
  requireAuth,
  requirePermissionAny([
    { module: "orders", action: "read" },
    { module: "reports", action: "read" },
  ]),
  async (req, res): Promise<void> => {
    const q = req.query as Record<string, string | undefined>;
    const branchIdParam = q.branchId ? parseInt(String(q.branchId), 10) : NaN;
    const branchId = Number.isFinite(branchIdParam) && branchIdParam > 0 ? branchIdParam : null;
    const categoryIdParam = typeof q.categoryId === "string" ? parseInt(q.categoryId, 10) : NaN;
    const categoryIds = await resolveCategoryFilterIds(
      Number.isFinite(categoryIdParam) && categoryIdParam > 0 ? String(categoryIdParam) : undefined,
    );

    const createdAt = parseExportCreatedAt(q);
    const rows = await buildOrderExportRows(createdAt, branchId, categoryIds);

    res.json({
      generatedAt: new Date().toISOString(),
      count: rows.length,
      rows,
    });
  },
);

/** Product catalog export (products + variants sheets). */
router.get("/reports/products-export", requireAuth, requirePermission("products", "read"), async (req, res): Promise<void> => {
  const q = req.query as Record<string, string | undefined>;
  const categoryIds = await resolveProductExportCategoryIds(q.categoryId);
  const lowStockOnly = q.lowStock === "true";
  const createdAt = parseExportCreatedAt(q);
  const { products, variants } = await buildProductExportRows({
    search: q.search,
    categoryIds,
    lowStockOnly,
    createdAt,
  });

  res.json({
    generatedAt: new Date().toISOString(),
    productCount: products.length,
    variantCount: variants.length,
    products,
    variants,
  });
});

/** Inventory movements + current stock snapshot. */
router.get(
  "/reports/inventory-export",
  requireAuth,
  requirePermission("inventory", "read"),
  async (req, res): Promise<void> => {
    const q = req.query as Record<string, string | undefined>;
    const branchIdParam = q.branchId ? parseInt(String(q.branchId), 10) : NaN;
    const branchId = Number.isFinite(branchIdParam) && branchIdParam > 0 ? branchIdParam : null;
    const categoryIds = await resolveInventoryExportCategoryIds(q.categoryId);
    const type = q.type?.trim() || "all";
    const lowStockOnly = q.lowStock === "true";
    const createdAt = parseExportCreatedAt(q);
    const includeStock = q.includeStock !== "false";

    const [movements, stock] = await Promise.all([
      buildInventoryLogExportRows({ type, branchId, categoryIds, createdAt }),
      includeStock ? buildStockSnapshotExportRows({ categoryIds, lowStockOnly }) : Promise.resolve([]),
    ]);

    res.json({
      generatedAt: new Date().toISOString(),
      movementCount: movements.length,
      stockCount: stock.length,
      movements,
      stock,
    });
  },
);

export default router;

