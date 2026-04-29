import { Router, IRouter } from "express";
import { db, paymentsTable, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreatePaymentBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/payments", requireAuth, async (req, res): Promise<void> => {
  const { orderId, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let payments = await db.select().from(paymentsTable).offset(offset).limit(limitNum);
  if (orderId) payments = payments.filter(p => p.orderId === parseInt(orderId, 10));
  const data = payments.map(p => ({ ...p, amount: parseFloat(p.amount) }));
  res.json({ data, total: data.length, page: pageNum, limit: limitNum });
});

router.post("/payments", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, parsed.data.orderId));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  const [payment] = await db.insert(paymentsTable).values({
    ...parsed.data,
    amount: String(parsed.data.amount),
  }).returning();

  const newPaidAmount = parseFloat(order.paidAmount) + parsed.data.amount;
  await db.update(ordersTable).set({ paidAmount: String(newPaidAmount) }).where(eq(ordersTable.id, parsed.data.orderId));

  res.status(201).json({ ...payment, amount: parseFloat(payment.amount) });
});

export default router;
