import { Router, IRouter } from "express";
import { CreatePaymentBody } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma, toNumber } from "../lib/prisma";

const router: IRouter = Router();
function derivePaymentStatus(totalAmount: number, paidAmount: number): "due" | "partially_paid" | "paid" {
  if (paidAmount <= 0) return "due";
  if (paidAmount >= totalAmount) return "paid";
  return "partially_paid";
}

router.get("/payments", requireAuth, requirePermission("payments", "read"), async (req, res): Promise<void> => {
  const { orderId, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let payments = await prisma.payment.findMany({ skip: offset, take: limitNum });
  if (orderId) payments = payments.filter(p => p.orderId === parseInt(orderId, 10));
  const data = payments.map(p => ({ ...p, amount: toNumber(p.amount) }));
  res.json({ data, total: data.length, page: pageNum, limit: limitNum });
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

  res.status(201).json({ ...payment, amount: toNumber(payment.amount) });
});

export default router;
