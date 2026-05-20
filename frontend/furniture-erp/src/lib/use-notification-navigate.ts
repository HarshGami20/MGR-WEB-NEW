import { useLocation } from "wouter";
import { useCallback } from "react";
import type { NotificationRow } from "@/lib/notification-api";
import { notificationHref } from "@/lib/notification-links";

/** Navigate to the screen for this notification (path from server metadata or type). */
export function useNotificationNavigate() {
  const [, setLocation] = useLocation();

  return useCallback(
    (row: NotificationRow | { metadata?: unknown; notificationType?: string; module?: string | null }) => {
      const href =
        "recipientId" in row && "notificationId" in row
          ? notificationHref(row as NotificationRow)
          : notificationHref({
              recipientId: "",
              notificationId: "",
              title: "",
              message: "",
              notificationType: (row as { notificationType?: string }).notificationType ?? "",
              module: (row as { module?: string | null }).module ?? null,
              metadata: row.metadata,
              priority: "normal",
              isRead: false,
              readAt: null,
              createdAt: new Date().toISOString(),
              senderId: null,
              scheduledAt: null,
              expiresAt: null,
            });
      if (href) setLocation(href);
    },
    [setLocation],
  );
}
