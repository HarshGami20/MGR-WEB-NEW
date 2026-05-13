import type { Notification, NotificationPriority, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { getFirebaseMessaging } from "../lib/firebase-admin";
import { getRedisPublisher } from "../lib/redis-connection";
import { emitViaBridge } from "../realtime/socket-bridge";
import { getSocketServer } from "../realtime/socket-registry";
import { enqueuePushBatch, enqueueScheduledNotification, notificationQueue } from "../queues/notification-queue";
import { isSuperAdminRole } from "../lib/permissions";

const SOCKET_EVENT = "notification:new";

export type SendNotificationInput = {
  title: string;
  message: string;
  senderId?: number | null;
  notificationType: string;
  module?: string | null;
  metadata?: Prisma.JsonValue;
  priority?: NotificationPriority;
  scheduledAt?: Date | null;
  expiresAt?: Date | null;
};

export type NotificationPayload = {
  notificationId: string;
  recipientId: string;
  title: string;
  message: string;
  notificationType: string;
  module: string | null;
  metadata: Prisma.JsonValue;
  priority: NotificationPriority;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  senderId: number | null;
};

function parseStringArray(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json.filter((x): x is string => typeof x === "string");
}

async function recipientPreference(userId: number) {
  const pref = await prisma.notificationPreference.findUnique({ where: { userId } });
  return {
    socketEnabled: pref?.socketEnabled ?? true,
    pushEnabled: pref?.pushEnabled ?? true,
    mutedModules: parseStringArray(pref?.mutedModules),
    mutedTypes: parseStringArray(pref?.mutedTypes),
  };
}

function isMuted(module: string | null | undefined, type: string, pref: Awaited<ReturnType<typeof recipientPreference>>) {
  if (module && pref.mutedModules.includes(module)) return true;
  if (pref.mutedTypes.includes(type)) return true;
  return false;
}

function toPayload(
  n: Notification,
  recipient: { id: string; isRead: boolean; readAt: Date | null },
): NotificationPayload {
  return {
    notificationId: n.id,
    recipientId: recipient.id,
    title: n.title,
    message: n.message,
    notificationType: n.notificationType,
    module: n.module,
    metadata: n.metadata,
    priority: n.priority,
    isRead: recipient.isRead,
    readAt: recipient.readAt ? recipient.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
    senderId: n.senderId,
  };
}

async function emitToUsers(
  userIds: number[],
  payload: NotificationPayload,
  roleIdsByUser?: Map<number, number | null>,
  branchIdsListByUser?: Map<number, number[]>,
): Promise<void> {
  const redis = getRedisPublisher();
  const io = getSocketServer();
  const rooms = new Set<string>();
  for (const uid of userIds) {
    rooms.add(`user:${uid}`);
    const rid = roleIdsByUser?.get(uid);
    if (rid != null) rooms.add(`role:${rid}`);
    const bids = branchIdsListByUser?.get(uid);
    if (bids && bids.length > 0) {
      for (const bid of bids) rooms.add(`branch:${bid}`);
    }
  }
  logger.debug(
    {
      ns: "notifications",
      event: SOCKET_EVENT,
      targetUsers: userIds,
      roomCount: rooms.size,
      notificationId: payload.notificationId,
      redisBridge: Boolean(redis),
      directSocket: Boolean(io),
    },
    "socket: emitting notification",
  );
  emitViaBridge(redis, io, { rooms: [...rooms], event: SOCKET_EVENT, data: payload });
}

/** When `true`, send FCM from the API process instead of BullMQ (use if Redis is on but the worker is not running). */
function useInlinePush(): boolean {
  const v = process.env["NOTIFICATION_PUSH_INLINE"]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function sendPushToUsers(userIds: number[], title: string, body: string, data?: Record<string, string>): Promise<void> {
  if (userIds.length === 0) return;
  const queued = Boolean(notificationQueue && !useInlinePush());
  logger.info(
    {
      ns: "notifications",
      mode: queued ? "bullmq_queue" : "inline_apiprocess",
      targetUserCount: userIds.length,
      titlePreview: title.slice(0, 120),
    },
    "FCM: scheduling push",
  );
  if (queued) {
    await enqueuePushBatch({ userIds, title, body, data });
    logger.info({ ns: "notifications", targetUserCount: userIds.length }, "FCM: push_batch job enqueued");
    return;
  }
  await flushPushBatch({ userIds, title, body, data });
}

/** Exported for the BullMQ worker when the queue is enabled */
export async function flushPushBatch(job: {
  userIds: number[];
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void> {
  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    logger.warn(
      { ns: "notifications", targetUserCount: job.userIds.length },
      "FCM: flushPushBatch skipped — Firebase Admin not initialized",
    );
    return;
  }

  const tokens = await prisma.userFcmToken.findMany({
    where: { userId: { in: job.userIds } },
    select: { token: true, userId: true },
  });
  if (tokens.length === 0) {
    logger.info(
      { ns: "notifications", targetUserIds: job.userIds },
      "FCM: no device tokens stored for target users — register via POST /api/notifications/fcm-token",
    );
    return;
  }

  const chunkSize = 500;
  for (let i = 0; i < tokens.length; i += chunkSize) {
    const slice = tokens.slice(i, i + chunkSize);
    const registrationTokens = slice.map((t) => t.token);
    try {
      const res = await messaging.sendEachForMulticast({
        tokens: registrationTokens,
        notification: { title: job.title, body: job.body },
        data: job.data,
        android: { priority: "high" },
        apns: {
          payload: { aps: { sound: "default", contentAvailable: true } },
        },
      });
      const failedSamples: string[] = [];
      let idx = 0;
      for (const r of res.responses) {
        const tok = slice[idx];
        idx += 1;
        if (!r.success && r.error?.code === "messaging/registration-token-not-registered") {
          await prisma.userFcmToken.deleteMany({ where: { token: tok.token } }).catch(() => undefined);
        }
        if (!r.success && failedSamples.length < 5 && r.error?.code) {
          failedSamples.push(r.error.code);
        }
      }
      logger.info(
        {
          ns: "notifications",
          chunkIndex: Math.floor(i / chunkSize),
          tokenCount: registrationTokens.length,
          successCount: res.successCount,
          failureCount: res.failureCount,
          sampleErrors: [...new Set(failedSamples)],
        },
        "FCM: multicast batch completed",
      );
      await prisma.notificationLog.createMany({
        data: slice.map((t) => ({
          notificationId: null,
          userId: t.userId,
          channel: "push",
          status: "sent",
          detail: { batch: true } as Prisma.InputJsonValue,
        })),
      });
    } catch (err) {
      logger.error({ err }, "FCM multicast failed");
      await prisma.notificationLog.create({
        data: {
          channel: "push",
          status: "failed",
          detail: { error: String(err) } as Prisma.InputJsonValue,
        },
      });
    }
  }
}

async function loadUsersMeta(userIds: number[]) {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      roleId: true,
      branchId: true,
      role: { select: { name: true } },
      userBranches: { select: { branchId: true } },
    },
  });
  const needsAllBranches = users.some((u) => isSuperAdminRole(u));
  const allActiveBranchIds = needsAllBranches
    ? (await prisma.branch.findMany({ where: { isActive: true }, select: { id: true } })).map((b) => b.id)
    : [];
  const roleMap = new Map<number, number | null>();
  const branchListMap = new Map<number, number[]>();
  for (const u of users) {
    roleMap.set(u.id, u.roleId ?? null);
    if (isSuperAdminRole(u)) {
      branchListMap.set(u.id, allActiveBranchIds);
      continue;
    }
    const fromJoin = u.userBranches.map((x) => x.branchId);
    const list = fromJoin.length > 0 ? [...new Set(fromJoin)] : u.branchId != null ? [u.branchId] : [];
    branchListMap.set(u.id, list);
  }
  return { roleMap, branchListMap };
}

export const notificationService = {
  async sendSocketNotification(
    userIds: number[],
    payload: NotificationPayload,
    meta?: { roleMap?: Map<number, number | null>; branchListMap?: Map<number, number[]> },
  ): Promise<void> {
    let roleMap = meta?.roleMap;
    let branchListMap = meta?.branchListMap;
    if (!roleMap || !branchListMap) {
      const m = await loadUsersMeta(userIds);
      roleMap = m.roleMap;
      branchListMap = m.branchListMap;
    }
    await emitToUsers(userIds, payload, roleMap, branchListMap);
  },

  async sendPushNotification(userIds: number[], title: string, body: string, data?: Record<string, string>): Promise<void> {
    await sendPushToUsers(userIds, title, body, data);
  },

  async sendToUser(
    userId: number,
    input: SendNotificationInput,
    options?: { senderUserId?: number | null; skipPush?: boolean },
  ): Promise<Notification> {
    return notificationService.sendToUsers([userId], input, options);
  },

  async sendToUsers(
    userIds: number[],
    input: SendNotificationInput,
    options?: { senderUserId?: number | null; skipPush?: boolean },
  ): Promise<Notification> {
    const unique = [...new Set(userIds)].filter((id) => id > 0);
    if (unique.length === 0) {
      throw new Error("sendToUsers: no recipients");
    }

    const senderId = input.senderId ?? options?.senderUserId ?? null;
    const notif = await prisma.notification.create({
      data: {
        title: input.title,
        message: input.message,
        senderId,
        notificationType: input.notificationType,
        module: input.module ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        priority: input.priority ?? "normal",
        scheduledAt: input.scheduledAt ?? null,
        expiresAt: input.expiresAt ?? null,
        isBroadcast: false,
      },
    });

    await prisma.notificationRecipient.createMany({
      data: unique.map((userId) => ({
        notificationId: notif.id,
        userId,
      })),
      skipDuplicates: true,
    });

    const scheduled = input.scheduledAt && input.scheduledAt.getTime() > Date.now();
    if (scheduled) {
      const runAt = input.scheduledAt!;
      if (notificationQueue) {
        await enqueueScheduledNotification(notif.id, runAt);
      } else {
        const delay = Math.max(0, runAt.getTime() - Date.now());
        setTimeout(() => {
          void notificationService.deliverScheduledNotification(notif.id);
        }, delay);
      }
      return notif;
    }

    const recipients = await prisma.notificationRecipient.findMany({
      where: { notificationId: notif.id },
    });

    const { roleMap, branchListMap } = await loadUsersMeta(unique);

    for (const r of recipients) {
      const pref = await recipientPreference(r.userId);
      if (!pref.socketEnabled || isMuted(notif.module, notif.notificationType, pref)) continue;
      const payload = toPayload(notif, r);
      await emitToUsers([r.userId], payload, roleMap, branchListMap);
    }

    if (!options?.skipPush) {
      const pushTargets: number[] = [];
      for (const uid of unique) {
        const pref = await recipientPreference(uid);
        if (!pref.pushEnabled || isMuted(notif.module, notif.notificationType, pref)) continue;
        pushTargets.push(uid);
      }
      if (pushTargets.length > 0) {
        await sendPushToUsers(
          pushTargets,
          notif.title,
          notif.message,
          stringifyData({
            notificationId: notif.id,
            type: notif.notificationType,
            module: notif.module ?? "",
          }),
        );
      }
    }

    return notif;
  },

  async sendToRole(
    roleId: number,
    input: SendNotificationInput,
    options?: { senderUserId?: number | null; skipPush?: boolean },
  ): Promise<Notification> {
    const users = await prisma.user.findMany({
      where: { isActive: true, roleId },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    return notificationService.sendToUsers(ids, input, options);
  },

  async sendBroadcast(
    input: SendNotificationInput,
    options?: { senderUserId?: number | null; skipPush?: boolean },
  ): Promise<Notification> {
    const senderId = input.senderId ?? options?.senderUserId ?? null;
    const notif = await prisma.notification.create({
      data: {
        title: input.title,
        message: input.message,
        senderId,
        notificationType: input.notificationType,
        module: input.module ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        priority: input.priority ?? "normal",
        scheduledAt: input.scheduledAt ?? null,
        expiresAt: input.expiresAt ?? null,
        isBroadcast: true,
      },
    });

    let cursor = 0;
    const batchSize = 500;
    for (;;) {
      const batch = await prisma.user.findMany({
        where: { isActive: true, id: { gt: cursor } },
        orderBy: { id: "asc" },
        take: batchSize,
        select: { id: true },
      });
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1]!.id;

      await prisma.notificationRecipient.createMany({
        data: batch.map((u) => ({ notificationId: notif.id, userId: u.id })),
        skipDuplicates: true,
      });

      const ids = batch.map((b) => b.id);
      const recipients = await prisma.notificationRecipient.findMany({
        where: { notificationId: notif.id, userId: { in: ids } },
      });
      const { roleMap, branchListMap } = await loadUsersMeta(ids);

      for (const r of recipients) {
        const pref = await recipientPreference(r.userId);
        if (!pref.socketEnabled || isMuted(notif.module, notif.notificationType, pref)) continue;
        await emitToUsers([r.userId], toPayload(notif, r), roleMap, branchListMap);
      }

      if (!options?.skipPush) {
        const pushTargets: number[] = [];
        for (const uid of ids) {
          const pref = await recipientPreference(uid);
          if (!pref.pushEnabled || isMuted(notif.module, notif.notificationType, pref)) continue;
          pushTargets.push(uid);
        }
        if (pushTargets.length > 0) {
          await sendPushToUsers(
            pushTargets,
            notif.title,
            notif.message,
            stringifyData({
              notificationId: notif.id,
              type: notif.notificationType,
              module: notif.module ?? "",
            }),
          );
        }
      }
    }

    return notif;
  },

  async scheduleNotification(
    userIds: number[],
    input: SendNotificationInput,
    scheduledAt: Date,
    options?: { senderUserId?: number | null },
  ): Promise<Notification> {
    if (scheduledAt.getTime() <= Date.now()) {
      return notificationService.sendToUsers(userIds, { ...input, scheduledAt: null }, options);
    }
    return notificationService.sendToUsers(
      userIds,
      {
        ...input,
        scheduledAt,
      },
      { ...options, skipPush: true },
    );
  },

  async deliverScheduledNotification(notificationId: string): Promise<void> {
    const notif = await prisma.notification.findUnique({
      where: { id: notificationId },
      include: { recipients: true },
    });
    if (!notif) {
      logger.warn({ ns: "notifications", notificationId }, "scheduled notification: row not found");
      return;
    }
    if (notif.expiresAt && notif.expiresAt.getTime() < Date.now()) {
      logger.info({ ns: "notifications", notificationId }, "scheduled notification: skipped (expired)");
      return;
    }
    logger.info(
      {
        ns: "notifications",
        notificationId,
        recipientCount: notif.recipients.length,
        type: notif.notificationType,
      },
      "scheduled notification: delivering",
    );

    const userIds = notif.recipients.map((r) => r.userId);
    const { roleMap, branchListMap } = await loadUsersMeta(userIds);

    for (const r of notif.recipients) {
      const pref = await recipientPreference(r.userId);
      if (!pref.socketEnabled || isMuted(notif.module, notif.notificationType, pref)) continue;
      await emitToUsers([r.userId], toPayload(notif, r), roleMap, branchListMap);
    }

    const pushTargets: number[] = [];
    for (const uid of userIds) {
      const pref = await recipientPreference(uid);
      if (!pref.pushEnabled || isMuted(notif.module, notif.notificationType, pref)) continue;
      pushTargets.push(uid);
    }
    if (pushTargets.length > 0) {
      await sendPushToUsers(
        pushTargets,
        notif.title,
        notif.message,
        stringifyData({
          notificationId: notif.id,
          type: notif.notificationType,
          module: notif.module ?? "",
        }),
      );
    }
  },

  async markAsRead(userId: number, recipientId: string): Promise<void> {
    const row = await prisma.notificationRecipient.findFirst({
      where: { id: recipientId, userId },
    });
    if (!row) return;
    await prisma.notificationRecipient.update({
      where: { id: recipientId },
      data: { isRead: true, readAt: new Date() },
    });
  },

  async markAllRead(userId: number): Promise<void> {
    await prisma.notificationRecipient.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  },

  async deleteNotification(userId: number, recipientId: string): Promise<void> {
    await prisma.notificationRecipient.deleteMany({
      where: { id: recipientId, userId },
    });
  },

  async saveFcmToken(
    userId: number,
    token: string,
    platform: string,
    deviceId?: string | null,
  ): Promise<void> {
    await prisma.userFcmToken.upsert({
      where: { token },
      create: { userId, token, platform, deviceId: deviceId ?? null },
      update: { userId, platform, deviceId: deviceId ?? null, updatedAt: new Date() },
    });
    logger.info(
      {
        ns: "notifications",
        userId,
        platform,
        deviceId: deviceId ?? null,
        tokenLength: token.length,
      },
      "FCM device token saved",
    );
  },

  async removeFcmToken(userId: number, token: string): Promise<void> {
    await prisma.userFcmToken.deleteMany({ where: { userId, token } });
  },
};

function stringifyData(obj: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v;
  }
  return out;
}
