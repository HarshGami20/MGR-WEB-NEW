import { customFetch } from "@/api-client/custom-fetch";
import { pushLog } from "@/lib/push-notification-log";

export type NotificationRow = {
  recipientId: string;
  notificationId: string;
  title: string;
  message: string;
  notificationType: string;
  module: string | null;
  metadata: unknown;
  priority: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  senderId: number | null;
  scheduledAt: string | null;
  expiresAt: string | null;
};

export type NotificationsResponse = {
  data: NotificationRow[];
  total: number;
  page: number;
  limit: number;
  unreadCount: number;
};

export async function getNotifications(page: number, limit: number): Promise<NotificationsResponse> {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  return customFetch<NotificationsResponse>(`/api/notifications?${qs}`);
}

export async function getUnreadCount(): Promise<{ count: number }> {
  return customFetch<{ count: number }>("/api/notifications/unread-count");
}

export async function markNotificationRead(recipientId: string): Promise<void> {
  await customFetch(`/api/notifications/${recipientId}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await customFetch("/api/notifications/read-all", { method: "POST" });
}

export async function deleteNotification(recipientId: string): Promise<void> {
  await customFetch(`/api/notifications/${recipientId}`, { method: "DELETE" });
}

export async function saveFcmToken(body: {
  token: string;
  platform: "web";
  deviceId?: string | null;
}): Promise<void> {
  pushLog("debug", "api_token_save", "POST /api/notifications/fcm-token", {
    platform: body.platform,
    tokenLength: body.token.length,
  });
  await customFetch("/api/notifications/fcm-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export type TestWebPushResponse = {
  ok: boolean;
  error?: string;
  tokenCount?: number;
  successCount?: number;
  failureCount?: number;
};

/** Ask the server to send an FCM notification to this browser’s saved token(s). */
export async function sendTestWebPush(): Promise<TestWebPushResponse> {
  pushLog("info", "api_test_push", "POST /api/notifications/test-web-push");
  const res = await customFetch<TestWebPushResponse>("/api/notifications/test-web-push", { method: "POST" });
  pushLog(res.ok ? "info" : "warn", "api_test_push_result", res.ok ? "Test push accepted by server" : (res.error ?? "Failed"), res);
  return res;
}

export type ServerPushLogRow = {
  id: string;
  userId: number | null;
  notificationId: string | null;
  channel: string;
  status: string;
  detail: unknown;
  createdAt: string;
};

export async function getServerPushLogs(limit = 50): Promise<{ data: ServerPushLogRow[] }> {
  const qs = new URLSearchParams({ limit: String(limit) });
  return customFetch<{ data: ServerPushLogRow[] }>(`/api/notifications/push-logs?${qs}`);
}
