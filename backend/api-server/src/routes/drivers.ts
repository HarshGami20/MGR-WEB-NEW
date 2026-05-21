import { Router, type IRouter } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma, toNumber } from "../lib/prisma";
import { requireWriteBranchId, readBranchIdFromRequest } from "../lib/branch-scope";
import { assignedBranchIds } from "../lib/user-branches";
import { enrichDriverRow } from "../lib/drivers";

const router: IRouter = Router();

const DriverBody = z.object({
  name: z.string().min(1, "Name is required"),
  mobile: z.string().max(30).optional().nullable(),
  vehicleInfo: z.string().max(200).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
  branchId: z.coerce.number().int().positive().optional().nullable(),
});

function branchWhereForUser(
  user: { branchId: number | null; userBranches?: { branchId: number }[] },
  reqBranchId: number | null,
): Prisma.DriverWhereInput | undefined {
  const assigned = assignedBranchIds(user);
  if (assigned.length === 0) {
    if (reqBranchId != null) return { branchId: reqBranchId };
    return undefined;
  }
  if (reqBranchId != null && assigned.includes(reqBranchId)) return { branchId: reqBranchId };
  return { branchId: { in: assigned } };
}

router.get("/drivers", requireAuth, requirePermission("deliveries", "read"), async (req, res): Promise<void> => {
  const user = (req as { user?: { branchId: number | null; userBranches?: { branchId: number }[] } }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { search, page = "1", limit = "50", isActive } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * limitNum;
  const reqBranchId = readBranchIdFromRequest(req);

  const where: Prisma.DriverWhereInput = {
    ...branchWhereForUser(user, reqBranchId),
    ...(isActive === "true" ? { isActive: true } : isActive === "false" ? { isActive: false } : {}),
    ...(search?.trim()
      ? {
          OR: [
            { name: { contains: search.trim(), mode: "insensitive" } },
            { mobile: { contains: search.trim() } },
            { vehicleInfo: { contains: search.trim(), mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.driver.findMany({
      where,
      skip: offset,
      take: limitNum,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        branch: { select: { id: true, name: true, code: true } },
        _count: { select: { orders: true, payments: true } },
      },
    }),
    prisma.driver.count({ where }),
  ]);

  res.json({
    data: rows.map(enrichDriverRow),
    total,
    page: pageNum,
    limit: limitNum,
  });
});

router.post("/drivers", requireAuth, requirePermission("deliveries", "create"), async (req, res): Promise<void> => {
  const parsed = DriverBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = (req as { user?: { branchId: number | null; userBranches?: { branchId: number }[] } }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  let branchId = parsed.data.branchId ?? (await requireWriteBranchId(req, res, user));
  if (branchId == null && parsed.data.branchId == null) {
    branchId = await requireWriteBranchId(req, res, user);
  }
  if (branchId == null && assignedBranchIds(user).length > 0) return;

  const created = await prisma.driver.create({
    data: {
      name: parsed.data.name.trim(),
      mobile: parsed.data.mobile?.trim() || null,
      vehicleInfo: parsed.data.vehicleInfo?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
      isActive: parsed.data.isActive ?? true,
      branchId: branchId ?? parsed.data.branchId ?? null,
    },
    include: { branch: { select: { id: true, name: true, code: true } } },
  });
  res.status(201).json(enrichDriverRow({ ...created, _count: { orders: 0, payments: 0 } }));
});

router.get("/drivers/:id", requireAuth, requirePermission("deliveries", "read"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid driver id" });
    return;
  }
  const driver = await prisma.driver.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      _count: { select: { orders: true, payments: true } },
    },
  });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  const orders = await prisma.order.findMany({
    where: { driverId: id },
    orderBy: [{ deliveryDate: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      customerMobile: true,
      deliveryDate: true,
      deliveryStatus: true,
      deliveryCharge: true,
      status: true,
      totalAmount: true,
      branchId: true,
      branch: { select: { id: true, name: true, code: true } },
    },
  });

  const payments = await prisma.driverPayment.findMany({
    where: { driverId: id },
    orderBy: { paidAt: "desc" },
    take: 50,
    include: {
      order: { select: { id: true, orderNumber: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  const paidTotal = await prisma.driverPayment.aggregate({
    where: { driverId: id },
    _sum: { amount: true },
  });

  res.json({
    ...enrichDriverRow(driver),
    orders: orders.map((o) => ({
      ...o,
      deliveryCharge: toNumber(o.deliveryCharge),
      totalAmount: toNumber(o.totalAmount),
    })),
    payments: payments.map((p) => ({
      id: p.id,
      driverId: p.driverId,
      orderId: p.orderId,
      amount: toNumber(p.amount),
      mode: p.mode,
      reference: p.reference,
      notes: p.notes,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
      order: p.order,
      recordedBy: p.createdBy?.name ?? null,
    })),
    paidTotal: toNumber(paidTotal._sum.amount ?? 0),
  });
});

router.put("/drivers/:id", requireAuth, requirePermission("deliveries", "update"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid driver id" });
    return;
  }
  const parsed = DriverBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await prisma.driver.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  const updated = await prisma.driver.update({
    where: { id },
    data: {
      name: parsed.data.name.trim(),
      mobile: parsed.data.mobile?.trim() || null,
      vehicleInfo: parsed.data.vehicleInfo?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      ...(parsed.data.branchId !== undefined ? { branchId: parsed.data.branchId } : {}),
    },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      _count: { select: { orders: true, payments: true } },
    },
  });
  res.json(enrichDriverRow(updated));
});

router.delete("/drivers/:id", requireAuth, requirePermission("deliveries", "delete"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid driver id" });
    return;
  }
  const existing = await prisma.driver.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  await prisma.driver.update({ where: { id }, data: { isActive: false } });
  res.json({ success: true });
});

export default router;
