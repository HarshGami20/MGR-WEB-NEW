import { Router, IRouter } from "express";
import { CreatePaymentBody } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma, toNumber } from "../lib/prisma";

const router: IRouter = Router();

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

  const payment = await prisma.payment.create({ data: {
    ...parsed.data,
    amount: String(parsed.data.amount),
  }});

  const newPaidAmount = toNumber(order.paidAmount) + parsed.data.amount;
  await prisma.order.update({ where: { id: parsed.data.orderId }, data: { paidAmount: String(newPaidAmount) } });

  res.status(201).json({ ...payment, amount: toNumber(payment.amount) });
});

export default router;
