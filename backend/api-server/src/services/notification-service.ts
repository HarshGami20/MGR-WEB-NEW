import type { Notification, NotificationPriority, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { logWebPush, persistPushLog } from "../lib/push-notification-log";
import { getFirebaseMessaging } from "../lib/firebase-admin";
import { getRedisPublisher } from "../lib/redis-connection";
import { emitViaBridge } from "../realtime/socket-bridge";
import { getSocketServer } from "../realtime/socket-registry";
import { enqueuePushBatch, enqueueScheduledNotification, notificationQueue } from "../queues/notification-queue";
import { isSuperAdminRole } from "../lib/permissions";
import { fcmMulticastAndroidOptions } from "../lib/fcm-android";

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

/**
 * Send FCM from the API process (same path as test push) unless queue mode is explicitly enabled.
 * Default inline: works without a separate `worker:notifications` process.
 * Set NOTIFICATION_PUSH_QUEUE=true when Redis + notification worker are always running.
 */
function useInlinePush(): boolean {
  const queueMode = process.env["NOTIFICATION_PUSH_QUEUE"]?.trim().toLowerCase();
  if (queueMode === "1" || queueMode === "true" || queueMode === "yes") return false;
  const forceInline = process.env["NOTIFICATION_PUSH_INLINE"]?.trim().toLowerCase();
  if (forceInline === "0" || forceInline === "false" || forceInline === "no") return false;
  return true;
}

async function sendPushToUsers(userIds: number[], title: string, body: string, data?: Record<string, string>): Promise<void> {
  if (userIds.length === 0) return;
  const queued = Boolean(notificationQueue && !useInlinePush());
  logWebPush(queued ? "push_queued" : "push_inline", {
    targetUserCount: userIds.length,
    titlePreview: title.slice(0, 120),
    mode: queued ? "bullmq" : "inline",
  });
  if (queued) {
    await enqueuePushBatch({ userIds, title, body, data });
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
    logWebPush("firebase_unavailable", { targetUserCount: job.userIds.length }, "warn");
    return;
  }

  const tokens = await prisma.userFcmToken.findMany({
    where: { userId: { in: job.userIds } },
    select: { token: true, userId: true },
  });
  if (tokens.length === 0) {
    logWebPush("push_no_tokens", { targetUserIds: job.userIds }, "warn");
    for (const uid of job.userIds) {
      await persistPushLog({
        userId: uid,
        status: "skipped",
        detail: { reason: "no_fcm_token", title: job.title },
      });
    }
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
        android: fcmMulticastAndroidOptions(),
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
      logWebPush("push_sent", {
        chunkIndex: Math.floor(i / chunkSize),
        tokenCount: registrationTokens.length,
        successCount: res.successCount,
        failureCount: res.failureCount,
        sampleErrors: [...new Set(failedSamples)],
        titlePreview: job.title.slice(0, 120),
      });
      await prisma.notificationLog.createMany({
        data: slice.map((t, idx) => ({
          notificationId: null,
          userId: t.userId,
          channel: "push",
          status: res.responses[idx]?.success ? "sent" : "failed",
          detail: {
            batch: true,
            title: job.title,
            error: res.responses[idx]?.error?.code ?? null,
          } as Prisma.InputJsonValue,
        })),
      });
    } catch (err) {
      logWebPush("push_failed", { error: String(err), title: job.title }, "error");
      await prisma.notificationLog.create({
        data: {
          channel: "push",
          status: "failed",
          detail: { error: String(err), title: job.title } as Prisma.InputJsonValue,
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
        await sendPushToUsers(pushTargets, notif.title, notif.message, pushDataFromNotification(notif));
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
          await sendPushToUsers(pushTargets, notif.title, notif.message, pushDataFromNotification(notif));
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
      await sendPushToUsers(pushTargets, notif.title, notif.message, pushDataFromNotification(notif));
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
    logWebPush("token_saved", {
      userId,
      platform,
      deviceId: deviceId ?? null,
      tokenLength: token.length,
    });
    await persistPushLog({
      userId,
      status: "sent",
      detail: { event: "token_saved", platform, deviceId: deviceId ?? null },
    });
  },

  async removeFcmToken(userId: number, token: string): Promise<void> {
    await prisma.userFcmToken.deleteMany({ where: { userId, token } });
    logWebPush("token_removed", { userId, tokenLength: token.length });
  },

  /**
   * Sends an FCM data+notification message to this user's saved tokens only (Chrome / Web Push test).
   */
  async sendTestWebPush(userId: number): Promise<{
    ok: boolean;
    error?: string;
    tokenCount?: number;
    successCount?: number;
    failureCount?: number;
  }> {
    const messaging = await getFirebaseMessaging();
    if (!messaging) {
      logWebPush("firebase_unavailable", { userId }, "warn");
      return { ok: false, error: "Firebase Admin is not configured on the server (service account)." };
    }
    const rows = await prisma.userFcmToken.findMany({
      where: { userId },
      select: { token: true },
    });
    if (rows.length === 0) {
      logWebPush("push_no_tokens", { userId, context: "test" }, "warn");
      return {
        ok: false,
        error:
          "No FCM token for this account on this browser. Allow notifications, ensure Firebase + VAPID env is set, then reload and log in again.",
      };
    }
    const registrationTokens = rows.map((r) => r.token);
    try {
      const res = await messaging.sendEachForMulticast({
        tokens: registrationTokens,
        notification: {
          title: "Web push test",
          body: `MGR CASA ERP — ${new Date().toLocaleString()}`,
        },
        data: { type: "web_push_test", ts: String(Date.now()) },
        android: fcmMulticastAndroidOptions(),
        apns: {
          payload: { aps: { sound: "default", contentAvailable: true } },
        },
      });
      let idx = 0;
      for (const r of res.responses) {
        const tok = rows[idx];
        idx += 1;
        if (!r.success && r.error?.code === "messaging/registration-token-not-registered") {
          await prisma.userFcmToken.deleteMany({ where: { token: tok.token } }).catch(() => undefined);
        }
      }
      const ok = res.failureCount === 0;
      logWebPush(ok ? "push_test" : "push_test_failed", {
        userId,
        tokenCount: registrationTokens.length,
        successCount: res.successCount,
        failureCount: res.failureCount,
      }, ok ? "info" : "warn");
      await persistPushLog({
        userId,
        status: ok ? "sent" : "failed",
        detail: {
          event: "push_test",
          tokenCount: registrationTokens.length,
          successCount: res.successCount,
          failureCount: res.failureCount,
        },
      });
      return {
        ok,
        tokenCount: registrationTokens.length,
        successCount: res.successCount,
        failureCount: res.failureCount,
        error: ok ? undefined : `FCM failed for ${res.failureCount} of ${registrationTokens.length} token(s).`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logWebPush("push_test_failed", { userId, error: msg }, "error");
      await persistPushLog({ userId, status: "failed", detail: { event: "push_test", error: msg } });
      return { ok: false, error: msg };
    }
  },
};

function stringifyData(obj: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v;
  }
  return out;
}

function pushDataFromNotification(n: {
  id: string;
  notificationType: string;
  module: string | null;
  metadata: Prisma.JsonValue;
}): Record<string, string> {
  const meta =
    n.metadata && typeof n.metadata === "object" && !Array.isArray(n.metadata)
      ? (n.metadata as Record<string, unknown>)
      : {};
  const actionPath = typeof meta.actionPath === "string" ? meta.actionPath : "";
  return stringifyData({
    notificationId: n.id,
    type: n.notificationType,
    module: n.module ?? "",
    actionPath,
    orderId: meta.orderId != null ? String(meta.orderId) : "",
    complaintId: meta.complaintId != null ? String(meta.complaintId) : "",
    purchaseOrderId: meta.purchaseOrderId != null ? String(meta.purchaseOrderId) : "",
  });
}
