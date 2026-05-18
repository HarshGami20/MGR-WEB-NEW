import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { notificationMutationLimiter, notificationRestLimiter } from "../middlewares/rate-limit-notifications";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { notificationService } from "../services/notification-service";
import { isSuperAdminRole } from "../lib/permissions";

const router: IRouter = Router();

const SaveFcmBody = z.object({
  token: z.string().min(1),
  platform: z.enum(["web", "android", "ios"]),
  deviceId: z.string().max(200).optional().nullable(),
});

const PreferencesBody = z.object({
  pushEnabled: z.boolean().optional(),
  socketEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  mutedModules: z.array(z.string()).optional(),
  mutedTypes: z.array(z.string()).optional(),
  digestFrequency: z.enum(["instant", "daily", "weekly"]).optional(),
});

const BroadcastBody = z.object({
  title: z.string().min(1),
  message: z.string().min(1),
  notificationType: z.string().min(1),
  module: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

function notExpiredFilter() {
  return {
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
}

router.get("/notifications", requireAuth, notificationRestLimiter, async (req, res): Promise<void> => {
  const userId = (req as { user?: { id: number } }).user!.id;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const skip = (page - 1) * limit;

  const where = {
    userId,
    notification: notExpiredFilter(),
  };

  const [rows, total, unread] = await prisma.$transaction([
    prisma.notificationRecipient.findMany({
      where,
      orderBy: { notification: { createdAt: "desc" } },
      skip,
      take: limit,
      include: { notification: true },
    }),
    prisma.notificationRecipient.count({ where }),
    prisma.notificationRecipient.count({
      where: { ...where, isRead: false },
    }),
  ]);

  res.json({
    data: rows.map((r) => ({
      recipientId: r.id,
      notificationId: r.notification.id,
      title: r.notification.title,
      message: r.notification.message,
      notificationType: r.notification.notificationType,
      module: r.notification.module,
      metadata: r.notification.metadata,
      priority: r.notification.priority,
      isRead: r.isRead,
      readAt: r.readAt ? r.readAt.toISOString() : null,
      createdAt: r.notification.createdAt.toISOString(),
      senderId: r.notification.senderId,
      scheduledAt: r.notification.scheduledAt ? r.notification.scheduledAt.toISOString() : null,
      expiresAt: r.notification.expiresAt ? r.notification.expiresAt.toISOString() : null,
    })),
    total,
    page,
    limit,
    unreadCount: unread,
  });
});

router.get("/notifications/push-logs", requireAuth, notificationRestLimiter, async (req, res): Promise<void> => {
  const userId = (req as { user?: { id: number; role?: { name?: string | null } | null } }).user!.id;
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
  const rows = await prisma.notificationLog.findMany({
    where: { channel: "push", userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  res.json({
    data: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      notificationId: r.notificationId,
      channel: r.channel,
      status: r.status,
      detail: r.detail,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

router.get("/notifications/unread-count", requireAuth, notificationRestLimiter, async (req, res): Promise<void> => {
  const userId = (req as { user?: { id: number } }).user!.id;
  const count = await prisma.notificationRecipient.count({
    where: {
      userId,
      isRead: false,
      notification: notExpiredFilter(),
    },
  });
  res.json({ count });
});

router.patch("/notifications/:recipientId/read", requireAuth, notificationMutationLimiter, async (req, res): Promise<void> => {
  const userId = (req as { user?: { id: number } }).user!.id;
  const recipientId = String(req.params.recipientId);
  await notificationService.markAsRead(userId, recipientId);
  res.json({ ok: true });
});

router.post("/notifications/read-all", requireAuth, notificationMutationLimiter, async (req, res): Promise<void> => {
  const userId = (req as { user?: { id: number } }).user!.id;
  await notificationService.markAllRead(userId);
  res.json({ ok: true });
});

router.delete("/notifications/:recipientId", requireAuth, notificationMutationLimiter, async (req, res): Promise<void> => {
  const userId = (req as { user?: { id: number } }).user!.id;
  const recipientId = String(req.params.recipientId);
  await notificationService.deleteNotification(userId, recipientId);
  res.status(204).end();
});

/** Trigger FCM web push to the signed-in user's registered device(s) only. */
router.post("/notifications/test-web-push", requireAuth, notificationMutationLimiter, async (req, res): Promise<void> => {
  const userId = (req as { user?: { id: number } }).user!.id;
  const result = await notificationService.sendTestWebPush(userId);
  res.json(result);
});

router.post("/notifications/fcm-token", requireAuth, notificationMutationLimiter, async (req, res): Promise<void> => {
  const parsed = SaveFcmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as { user?: { id: number } }).user!.id;
  await notificationService.saveFcmToken(userId, parsed.data.token, parsed.data.platform, parsed.data.deviceId);
  res.json({ ok: true });
});

router.delete("/notifications/fcm-token", requireAuth, notificationMutationLimiter, async (req, res): Promise<void> => {
  const token =
    (typeof req.body?.token === "string" ? req.body.token : "") ||
    (typeof req.query?.token === "string" ? req.query.token : "");
  if (!token) {
    res.status(400).json({ error: "token required" });
    return;
  }
  const userId = (req as { user?: { id: number } }).user!.id;
  await notificationService.removeFcmToken(userId, token);
  res.json({ ok: true });
});

router.get("/notifications/preferences", requireAuth, notificationRestLimiter, async (req, res): Promise<void> => {
  const userId = (req as { user?: { id: number } }).user!.id;
  const pref = await prisma.notificationPreference.findUnique({ where: { userId } });
  res.json(
    pref ?? {
      userId,
      pushEnabled: true,
      socketEnabled: true,
      emailEnabled: false,
      mutedModules: [],
      mutedTypes: [],
      digestFrequency: "instant",
    },
  );
});

router.patch("/notifications/preferences", requireAuth, notificationMutationLimiter, async (req, res): Promise<void> => {
  const parsed = PreferencesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as { user?: { id: number } }).user!.id;
  const data = parsed.data;
  const pref = await prisma.notificationPreference.upsert({
    where: { userId },
    create: {
      userId,
      pushEnabled: data.pushEnabled ?? true,
      socketEnabled: data.socketEnabled ?? true,
      emailEnabled: data.emailEnabled ?? false,
      mutedModules: data.mutedModules ?? [],
      mutedTypes: data.mutedTypes ?? [],
      digestFrequency: data.digestFrequency ?? "instant",
    },
    update: {
      ...(data.pushEnabled !== undefined ? { pushEnabled: data.pushEnabled } : {}),
      ...(data.socketEnabled !== undefined ? { socketEnabled: data.socketEnabled } : {}),
      ...(data.emailEnabled !== undefined ? { emailEnabled: data.emailEnabled } : {}),
      ...(data.mutedModules !== undefined ? { mutedModules: data.mutedModules } : {}),
      ...(data.mutedTypes !== undefined ? { mutedTypes: data.mutedTypes } : {}),
      ...(data.digestFrequency !== undefined ? { digestFrequency: data.digestFrequency } : {}),
    },
  });
  res.json(pref);
});

router.post("/notifications/broadcast", requireAuth, notificationMutationLimiter, async (req, res): Promise<void> => {
  const user = (req as { user?: { id: number; role?: { name?: string | null } | null } }).user!;
  if (!isSuperAdminRole(user)) {
    res.status(403).json({ error: "Only Super Admin can broadcast" });
    return;
  }
  const parsed = BroadcastBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const n = await notificationService.sendBroadcast(
    {
      title: parsed.data.title,
      message: parsed.data.message,
      notificationType: parsed.data.notificationType,
      module: parsed.data.module ?? null,
      metadata: (parsed.data.metadata ?? {}) as Prisma.JsonValue,
      priority: parsed.data.priority,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    },
    { senderUserId: user.id },
  );
  res.status(201).json({ notificationId: n.id });
});

export default router;
