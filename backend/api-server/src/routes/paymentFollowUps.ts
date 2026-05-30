import { Router, type IRouter } from "express";
import { z } from "zod";
import { emitSafe } from "../lib/app-events";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { toNumber } from "../lib/prisma";

const router: IRouter = Router();

const PENDING_PAYMENT_STATUSES = ["due", "partially_paid"] as const;

function parseYmdDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo || dt.getUTCDate() !== d) return null;
  return dt;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function serializeFollowUp(row: {
  id: number;
  orderId: number;
  followUpDate: Date;
  note: string;
  createdAt: Date;
  createdBy: { id: number; name: string; mobile: string; avatarUrl: string | null } | null;
  order?: {
    id: number;
    orderNumber: string;
    customerName: string;
    customerMobile: string | null;
    paymentStatus: string;
    totalAmount: unknown;
    paidAmount: unknown;
    branchId: number | null;
  } | null;
}) {
  const order = row.order;
  const total = order ? toNumber(order.totalAmount) : 0;
  const paid = order ? toNumber(order.paidAmount) : 0;
  return {
    id: row.id,
    orderId: row.orderId,
    followUpDate: row.followUpDate.toISOString().slice(0, 10),
    note: row.note,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    order: order
      ? {
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          customerMobile: order.customerMobile,
          paymentStatus: order.paymentStatus,
          totalAmount: total,
          paidAmount: paid,
          balanceDue: Math.max(0, total - paid),
          branchId: order.branchId,
        }
      : null,
  };
}

const followUpInclude = {
  createdBy: { select: { id: true, name: true, mobile: true, avatarUrl: true } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      customerMobile: true,
      paymentStatus: true,
      totalAmount: true,
      paidAmount: true,
      branchId: true,
    },
  },
} as const;

async function assertOrderAllowsFollowUp(orderId: number): Promise<{ ok: true; order: { paymentStatus: string } } | { ok: false; status: number; error: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { paymentStatus: true },
  });
  if (!order) return { ok: false, status: 404, error: "Order not found" };
  if (!PENDING_PAYMENT_STATUSES.includes(order.paymentStatus as (typeof PENDING_PAYMENT_STATUSES)[number])) {
    return {
      ok: false,
      status: 400,
      error: "Payment follow-ups are only allowed when payment status is due or partially paid",
    };
  }
  return { ok: true, order };
}

/** Date-wise follow-ups (default: today). Only orders with due / partially_paid payment. */
router.get("/payment-follow-ups", requireAuth, requirePermission("payments", "read"), async (req, res): Promise<void> => {
  const dateParam = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().slice(0, 10);
  const followUpDate = parseYmdDate(dateParam);
  if (!followUpDate) {
    res.status(400).json({ error: "Invalid date; use YYYY-MM-DD" });
    return;
  }

  const branchId =
    req.query.branchId != null && req.query.branchId !== ""
      ? parseInt(String(req.query.branchId), 10)
      : undefined;

  const rows = await prisma.paymentFollowUp.findMany({
    where: {
      followUpDate,
      order: {
        paymentStatus: { in: [...PENDING_PAYMENT_STATUSES] },
        ...(branchId != null && Number.isFinite(branchId) ? { branchId } : {}),
      },
    },
    include: followUpInclude,
    orderBy: [{ createdAt: "desc" }],
  });

  res.json({ data: rows.map(serializeFollowUp), date: dateParam });
});

/** Overdue + due-today reminders for pending payment orders. */
router.get("/payment-follow-ups/reminders", requireAuth, requirePermission("payments", "read"), async (req, res): Promise<void> => {
  const today = startOfUtcDay(new Date());
  const branchId =
    req.query.branchId != null && req.query.branchId !== ""
      ? parseInt(String(req.query.branchId), 10)
      : undefined;

  const rows = await prisma.paymentFollowUp.findMany({
    where: {
      followUpDate: { lte: today },
      order: {
        paymentStatus: { in: [...PENDING_PAYMENT_STATUSES] },
        ...(branchId != null && Number.isFinite(branchId) ? { branchId } : {}),
      },
    },
    include: followUpInclude,
    orderBy: [{ followUpDate: "asc" }, { createdAt: "desc" }],
  });

  const overdue = rows.filter(r => r.followUpDate < today);
  const dueToday = rows.filter(r => r.followUpDate.getTime() === today.getTime());

  res.json({
    data: rows.map(serializeFollowUp),
    overdue: overdue.map(serializeFollowUp),
    dueToday: dueToday.map(serializeFollowUp),
    counts: { total: rows.length, overdue: overdue.length, dueToday: dueToday.length },
  });
});

router.get("/orders/:orderId/payment-follow-ups", requireAuth, requirePermission("payments", "read"), async (req, res): Promise<void> => {
  const orderId = parseInt(String(req.params.orderId), 10);
  if (!Number.isFinite(orderId)) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }

  const rows = await prisma.paymentFollowUp.findMany({
    where: { orderId },
    include: { createdBy: { select: { id: true, name: true, mobile: true, avatarUrl: true } } },
    orderBy: [{ followUpDate: "desc" }, { createdAt: "desc" }],
  });

  res.json({
    data: rows.map(r => ({
      id: r.id,
      orderId: r.orderId,
      followUpDate: r.followUpDate.toISOString().slice(0, 10),
      note: r.note,
      createdAt: r.createdAt,
      createdBy: r.createdBy,
    })),
  });
});

const createBodySchema = z.object({
  followUpDate: z.string().min(1),
  note: z.string().min(1).max(5000),
});

router.post("/orders/:orderId/payment-follow-ups", requireAuth, requirePermission("payments", "create"), async (req, res): Promise<void> => {
  const orderId = parseInt(String(req.params.orderId), 10);
  if (!Number.isFinite(orderId)) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }

  const parsed = createBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const followUpDate = parseYmdDate(parsed.data.followUpDate);
  if (!followUpDate) {
    res.status(400).json({ error: "Invalid followUpDate; use YYYY-MM-DD" });
    return;
  }

  const today = startOfUtcDay(new Date());
  if (followUpDate < today) {
    res.status(400).json({ error: "Follow-up date cannot be in the past" });
    return;
  }

  const check = await assertOrderAllowsFollowUp(orderId);
  if (!check.ok) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const userId = ((req as { user?: { id: number } }).user?.id ?? null) as number | null;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { orderNumber: true, branchId: true },
  });

  const row = await prisma.paymentFollowUp.create({
    data: {
      orderId,
      followUpDate,
      note: parsed.data.note.trim(),
      createdById: userId,
    },
    include: { createdBy: { select: { id: true, name: true, mobile: true, avatarUrl: true } } },
  });

  if (order) {
    emitSafe("PAYMENT_FOLLOW_UP_CREATED", {
      followUpId: row.id,
      orderId,
      orderNumber: order.orderNumber,
      branchId: order.branchId,
      followUpDate: row.followUpDate.toISOString().slice(0, 10),
      createdById: userId,
    });
  }

  res.status(201).json({
    id: row.id,
    orderId: row.orderId,
    followUpDate: row.followUpDate.toISOString().slice(0, 10),
    note: row.note,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  });
});

export default router;
