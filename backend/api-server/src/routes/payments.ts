import { Router, IRouter } from "express";
import type { Prisma } from "@prisma/client";
import { CreatePaymentBody } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma, toNumber } from "../lib/prisma";
import { emitSafe } from "../lib/app-events";

const router: IRouter = Router();
function derivePaymentStatus(totalAmount: number, paidAmount: number): "due" | "partially_paid" | "paid" {
  if (paidAmount <= 0) return "due";
  if (paidAmount >= totalAmount) return "paid";
  return "partially_paid";
}

router.get("/payments", requireAuth, requirePermission("payments", "read"), async (req, res): Promise<void> => {
  const { orderId, branchId, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const where: Prisma.PaymentWhereInput = {};
  if (orderId) {
    const oid = parseInt(orderId, 10);
    if (Number.isFinite(oid) && oid > 0) where.orderId = oid;
  }
  if (branchId) {
    const bid = parseInt(branchId, 10);
    if (Number.isFinite(bid) && bid > 0) {
      where.order = { branchId: bid };
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
      },
    }),
    prisma.payment.count({ where: whereClause }),
  ]);

  const data = payments.map(p => ({ ...p, amount: toNumber(p.amount) }));
  res.json({ data, total, page: pageNum, limit: limitNum });
});

router.post("/payments", requireAuth, requirePermission("payments", "create"), async (req, res): Promise<void> => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const order = await prisma.order.findUnique({ where: { id: parsed.data.orderId } });
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  const paymentAmount = Number(parsed.data.amount ?? 0);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    res.status(400).json({ error: "Payment amount must be greater than 0" });
    return;
  }
  const remainingAmount = Math.max(0, toNumber(order.totalAmount) - toNumber(order.paidAmount));
  if (paymentAmount > remainingAmount) {
    res.status(400).json({ error: `Payment amount cannot exceed remaining amount (${remainingAmount})` });
    return;
  }

  const nextPaidAmount = Math.min(toNumber(order.totalAmount), toNumber(order.paidAmount) + paymentAmount);
  const appliedAmount = nextPaidAmount - toNumber(order.paidAmount);
  if (appliedAmount <= 0) {
    res.status(400).json({ error: "Order is already fully paid" });
    return;
  }

  const payment = await prisma.payment.create({ data: {
    ...parsed.data,
    amount: String(appliedAmount),
  }});

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
  });

  res.status(201).json({ ...payment, amount: toNumber(payment.amount) });
});

export default router;
