import { Router, type IRouter } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma, toNumber } from "../lib/prisma";
import { readBranchIdFromRequest, requireWriteBranchId } from "../lib/branch-scope";
import { assignedBranchIds } from "../lib/user-branches";

const router: IRouter = Router();

const CreateDriverPaymentBody = z.object({
  driverId: z.coerce.number().int().positive(),
  orderId: z.coerce.number().int().positive().optional().nullable(),
  amount: z.coerce.number().positive(),
  mode: z.string().max(40).optional().default("cash"),
  reference: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  paidAt: z.string().optional(),
});

router.get(
  "/driver-payments",
  requireAuth,
  requirePermission("deliveries", "read"),
  async (req, res): Promise<void> => {
    const { driverId, orderId, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;
    const reqBranchId = readBranchIdFromRequest(req);

    const where: Prisma.DriverPaymentWhereInput = {};
    if (driverId) {
      const did = parseInt(driverId, 10);
      if (Number.isFinite(did)) where.driverId = did;
    }
    if (orderId) {
      const oid = parseInt(orderId, 10);
      if (Number.isFinite(oid)) where.orderId = oid;
    }
    if (reqBranchId != null) where.branchId = reqBranchId;

    const [rows, total] = await prisma.$transaction([
      prisma.driverPayment.findMany({
        where,
        skip: offset,
        take: limitNum,
        orderBy: { paidAt: "desc" },
        include: {
          driver: { select: { id: true, name: true, mobile: true } },
          order: { select: { id: true, orderNumber: true, customerName: true } },
          createdBy: { select: { id: true, name: true } },
        },
      }),
      prisma.driverPayment.count({ where }),
    ]);

    res.json({
      data: rows.map((p) => ({
        id: p.id,
        driverId: p.driverId,
        orderId: p.orderId,
        branchId: p.branchId,
        amount: toNumber(p.amount),
        mode: p.mode,
        reference: p.reference,
        notes: p.notes,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
        driver: p.driver,
        order: p.order,
        recordedBy: p.createdBy?.name ?? null,
      })),
      total,
      page: pageNum,
      limit: limitNum,
    });
  },
);

router.post(
  "/driver-payments",
  requireAuth,
  requirePermission("deliveries", "create"),
  async (req, res): Promise<void> => {
    const parsed = CreateDriverPaymentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const user = (req as { user?: { id: number; branchId: number | null; userBranches?: { branchId: number }[] } })
      .user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const driver = await prisma.driver.findFirst({
      where: { id: parsed.data.driverId, isActive: true },
    });
    if (!driver) {
      res.status(404).json({ error: "Driver not found" });
      return;
    }

    let orderBranchId: number | null = driver.branchId;
    if (parsed.data.orderId) {
      const order = await prisma.order.findUnique({
        where: { id: parsed.data.orderId },
        select: { id: true, branchId: true, driverId: true },
      });
      if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
      }
      if (order.driverId != null && order.driverId !== parsed.data.driverId) {
        res.status(400).json({ error: "Order is assigned to a different driver" });
        return;
      }
      orderBranchId = order.branchId ?? orderBranchId;
    }

    const branchId =
      orderBranchId ?? (await requireWriteBranchId(req, res, user)) ?? readBranchIdFromRequest(req);
    if (assignedBranchIds(user).length > 0 && branchId != null && !assignedBranchIds(user).includes(branchId)) {
      res.status(403).json({ error: "Forbidden", message: "Branch access denied" });
      return;
    }

    const paidAt = parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      res.status(400).json({ error: "Invalid paidAt date" });
      return;
    }

    const created = await prisma.driverPayment.create({
      data: {
        driverId: parsed.data.driverId,
        orderId: parsed.data.orderId ?? null,
        branchId,
        amount: String(parsed.data.amount),
        mode: parsed.data.mode ?? "cash",
        reference: parsed.data.reference?.trim() || null,
        notes: parsed.data.notes?.trim() || null,
        paidAt,
        createdById: user.id,
      },
      include: {
        driver: { select: { id: true, name: true, mobile: true } },
        order: { select: { id: true, orderNumber: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({
      id: created.id,
      driverId: created.driverId,
      orderId: created.orderId,
      amount: toNumber(created.amount),
      mode: created.mode,
      reference: created.reference,
      notes: created.notes,
      paidAt: created.paidAt,
      createdAt: created.createdAt,
      driver: created.driver,
      order: created.order,
      recordedBy: created.createdBy?.name ?? null,
    });
  },
);

export default router;
