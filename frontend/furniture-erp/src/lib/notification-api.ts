import { customFetch } from "@/api-client/custom-fetch";

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
  return customFetch<TestWebPushResponse>("/api/notifications/test-web-push", { method: "POST" });
}
