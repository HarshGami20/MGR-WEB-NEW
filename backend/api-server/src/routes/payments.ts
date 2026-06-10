import { Router, IRouter } from "express";
import type { Prisma } from "@prisma/client";
import { CreatePaymentBody } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission, hasStdPermission, type NormalizedModulePerms } from "../lib/permissions";
import { prisma, toNumber } from "../lib/prisma";
import { emitSafe } from "../lib/app-events";
import { ymdUtcDayEnd, ymdUtcDayStart } from "../lib/date-range";
import { orderHasProductInCategories, resolveCategoryFilterIds } from "../lib/category-filter";
import { remainingInrPaymentAmount, roundInrPaymentAmount } from "../lib/payment-amount";
import { assertCanReadOrderPayments } from "../lib/payment-access";

const router: IRouter = Router();
function derivePaymentStatus(totalAmount: number, paidAmount: number): "due" | "partially_paid" | "paid" {
  if (paidAmount <= 0) return "due";
  if (paidAmount >= totalAmount) return "paid";
  return "partially_paid";
}

router.get("/payments", requireAuth, async (req, res): Promise<void> => {
  const { orderId, branchId, page = "1", limit = "20", createdFrom, createdTo, categoryId } =
    req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const parsedOrderId = orderId ? parseInt(orderId, 10) : NaN;
  const hasOrderFilter = Number.isFinite(parsedOrderId) && parsedOrderId > 0;

  if (hasOrderFilter) {
    if (!(await assertCanReadOrderPayments(req, res, parsedOrderId))) return;
  } else {
    const matrix = (req as { permissionMatrix?: Record<string, NormalizedModulePerms> }).permissionMatrix ?? {};
    const user = (req as { user?: unknown }).user;
    if (!hasStdPermission(matrix, user, "payments", "read")) {
      res.status(403).json({ error: "Forbidden", message: "Insufficient permission" });
      return;
    }
  }

  const where: Prisma.PaymentWhereInput = {};
  if (hasOrderFilter) {
    where.orderId = parsedOrderId;
  }
  if (branchId) {
    const bid = parseInt(branchId, 10);
    if (Number.isFinite(bid) && bid > 0) {
      where.order = { ...(where.order as object), branchId: bid };
    }
  }
  if (typeof createdFrom === "string" && createdFrom.trim()) {
    const start = ymdUtcDayStart(createdFrom.trim());
    if (start) where.createdAt = { ...(where.createdAt as object), gte: start };
  }
  if (typeof createdTo === "string" && createdTo.trim()) {
    const end = ymdUtcDayEnd(createdTo.trim());
    if (end) where.createdAt = { ...(where.createdAt as object), lte: end };
  }

  const categoryIds = await resolveCategoryFilterIds(categoryId);
  if (categoryIds) {
    const orderCat = orderHasProductInCategories(categoryIds);
    if (where.order) {
      where.order = { AND: [where.order as Prisma.OrderWhereInput, orderCat] };
    } else {
      where.order = orderCat;
    }
  }

  const whereClause = Object.keys(where).length > 0 ? where : undefined;

  const [payments, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where: whereClause,
      skip: offset,
      take: limitNum,
      orderBy: { createdAt: "desc" },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
            branchId: true,
            branch: { select: { id: true, name: true, code: true } },
          },
        },
        createdBy: { select: { id: true, name: true } },
      },
    }),
    prisma.payment.count({ where: whereClause }),
  ]);

  const data = payments.map((p) => ({
    ...p,
    amount: toNumber(p.amount),
    recordedBy: p.createdBy?.name ?? null,
  }));
  res.json({ data, total, page: pageNum, limit: limitNum });
});

router.post("/payments", requireAuth, requirePermission("payments", "create"), async (req, res): Promise<void> => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const order = await prisma.order.findUnique({ where: { id: parsed.data.orderId } });
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  const paymentAmount = roundInrPaymentAmount(Number(parsed.data.amount ?? 0));
  if (paymentAmount <= 0) {
    res.status(400).json({ error: "Payment amount must be greater than 0" });
    return;
  }

  const totalAmount = toNumber(order.totalAmount);
  const paidAmount = toNumber(order.paidAmount);
  const maxPayment = remainingInrPaymentAmount(totalAmount, paidAmount);
  if (maxPayment <= 0) {
    res.status(400).json({ error: "Order is already fully paid" });
    return;
  }
  if (paymentAmount > maxPayment) {
    res.status(400).json({ error: `Payment amount cannot exceed remaining amount (${maxPayment})` });
    return;
  }

  const payingRoundedRemainder = paymentAmount >= maxPayment;
  const appliedAmount = payingRoundedRemainder ? maxPayment : paymentAmount;
  const nextPaidAmount = payingRoundedRemainder
    ? totalAmount
    : Math.min(totalAmount, paidAmount + paymentAmount);
  if (nextPaidAmount <= paidAmount) {
    res.status(400).json({ error: "Order is already fully paid" });
    return;
  }

  const mode = parsed.data.mode ?? "cash";
  const rawCheque = typeof parsed.data.chequeNumber === "string" ? parsed.data.chequeNumber.trim() : "";
  const chequeNumber = mode === "cheque" ? rawCheque || null : null;
  if (mode === "cheque" && !chequeNumber) {
    res.status(400).json({ error: "Cheque number is required when payment mode is cheque" });
    return;
  }

  const actor = (req as { user?: { id: number } }).user;
  const payment = await prisma.payment.create({
    data: {
      orderId: parsed.data.orderId,
      amount: String(appliedAmount),
      mode,
      chequeNumber,
      notes: parsed.data.notes ?? null,
      createdById: actor?.id ?? null,
    },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  await prisma.order.update({
    where: { id: parsed.data.orderId },
    data: {
      paidAmount: String(nextPaidAmount),
      paymentMode: parsed.data.mode,
      paymentStatus: derivePaymentStatus(toNumber(order.totalAmount), nextPaidAmount),
    },
  });

  emitSafe("PAYMENT_RECEIVED", {
    orderId: parsed.data.orderId,
    paymentId: payment.id,
    amount: payment.amount,
    recordedById: actor?.id ?? null,
  });

  res.status(201).json({
    ...payment,
    amount: toNumber(payment.amount),
    recordedBy: payment.createdBy?.name ?? null,
  });
});

export default router;
