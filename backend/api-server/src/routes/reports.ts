import { Router, IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma, toNumber } from "../lib/prisma";

const router: IRouter = Router();

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

router.get("/reports/revenue-summary", requireAuth, requirePermission("dashboard", "read"), async (req, res): Promise<void> => {
  const yearParam = req.query.year ? parseInt(String(req.query.year), 10) : undefined;
  const monthParam = req.query.month ? parseInt(String(req.query.month), 10) : undefined;
  const branchIdParam = req.query.branchId ? parseInt(String(req.query.branchId), 10) : NaN;
  const branchFilter =
    Number.isFinite(branchIdParam) && branchIdParam > 0 ? { branchId: branchIdParam } : {};

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
    },
    select: {
      id: true,
      createdAt: true,
      totalAmount: true,
      paidAmount: true,
      items: {
        select: {
          quantity: true,
          totalPrice: true,
          product: {
            select: {
              categoryId: true,
              category: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
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
  const byCategory = new Map<string, { categoryId: number | null; categoryName: string; revenue: number; orderItems: number; quantity: number }>();
  const byDay = new Map<string, { date: string; day: number; revenue: number; received: number; due: number; orders: number }>();

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

    for (const item of order.items) {
      const categoryId = item.product?.categoryId ?? null;
      const categoryName = item.product?.category?.name ?? "Uncategorized";
      const key = `${categoryId ?? "none"}::${categoryName}`;
      if (!byCategory.has(key)) {
        byCategory.set(key, {
          categoryId,
          categoryName,
          revenue: 0,
          orderItems: 0,
          quantity: 0,
        });
      }
      const catRow = byCategory.get(key)!;
      catRow.revenue += toNumber(item.totalPrice);
      catRow.orderItems += 1;
      catRow.quantity += item.quantity;
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

  const categoryWise = Array.from(byCategory.values())
    .sort((a, b) => b.revenue - a.revenue)
    .map((c) => ({
      ...c,
      revenue: Number(c.revenue.toFixed(2)),
    }));

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

  res.json({
    generatedAt: new Date().toISOString(),
    filters: {
      year: hasValidYear ? yearParam : null,
      month: hasValidMonth ? monthParam : null,
      branchId: Number.isFinite(branchIdParam) && branchIdParam > 0 ? branchIdParam : null,
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
  });
});

export default router;

