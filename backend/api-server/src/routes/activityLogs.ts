import { Router, type IRouter } from "express";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "../middlewares/auth";
import { requirePermission, requirePermissionAny } from "../lib/permissions";
import { prisma } from "../lib/prisma";
import { createdAtRangeFromQuery } from "../lib/created-at-filter";
import { ACTIVITY_LOG_SETUP_MESSAGE, getActivityLogDelegate } from "../lib/activity-log-client";

const router: IRouter = Router();

router.get(
  "/activity-logs",
  requireAuth,
  requirePermissionAny([
    { module: "activityLogs", action: "read" },
    { module: "users", action: "read" },
  ]),
  async (req, res): Promise<void> => {
  const activityLog = getActivityLogDelegate();
  if (!activityLog) {
    res.status(503).json({ error: ACTIVITY_LOG_SETUP_MESSAGE });
    return;
  }

  const q = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(q.page || "1", 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(q.limit || "50", 10) || 50));
  const offset = (pageNum - 1) * limitNum;

  const where: Prisma.ActivityLogWhereInput = {};
  const and: Prisma.ActivityLogWhereInput[] = [];

  if (q.module?.trim()) {
    and.push({ module: q.module.trim() });
  }
  if (q.action?.trim()) {
    and.push({ action: q.action.trim() });
  }
  if (q.userId?.trim()) {
    const userId = parseInt(q.userId, 10);
    if (Number.isFinite(userId) && userId > 0) and.push({ userId });
  }
  if (q.branchId?.trim()) {
    const branchId = parseInt(q.branchId, 10);
    if (Number.isFinite(branchId) && branchId > 0) and.push({ branchId });
  }
  if (q.entityType?.trim()) {
    and.push({ entityType: { contains: q.entityType.trim(), mode: "insensitive" } });
  }
  if (q.search?.trim()) {
    const search = q.search.trim();
    and.push({
      OR: [
        { summary: { contains: search, mode: "insensitive" } },
        { entityId: { contains: search, mode: "insensitive" } },
        { path: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { mobile: { contains: search, mode: "insensitive" } } },
      ],
    });
  }

  const createdRange = createdAtRangeFromQuery(q.createdFrom, q.createdTo);
  if (createdRange) and.push({ createdAt: createdRange });

  if (and.length === 1) Object.assign(where, and[0]);
  else if (and.length > 1) where.AND = and;

  const [total, rows] = await Promise.all([
    activityLog.count({ where }),
    activityLog.findMany({
      where,
      skip: offset,
      take: limitNum,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        user: { select: { id: true, name: true, mobile: true } },
        branch: { select: { id: true, name: true } },
      },
    }),
  ]);

  res.json({
    data: rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      user: row.user,
      action: row.action,
      module: row.module,
      entityType: row.entityType,
      entityId: row.entityId,
      branchId: row.branchId,
      branch: row.branch,
      summary: row.summary,
      method: row.method,
      path: row.path,
      metadata: row.metadata,
      createdAt: row.createdAt,
    })),
    total,
    page: pageNum,
    limit: limitNum,
  });
});

export default router;
