import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { isWebPushConfigured, onForegroundMessage, registerWebPush, showSystemNotification } from "@/lib/fcm-web";
import { attachServiceWorkerPushLogListener, pushLog } from "@/lib/push-notification-log";
import { notificationPayloadHref } from "@/lib/notification-links";
import { useNotificationNavigate } from "@/lib/use-notification-navigate";
import { getAuthToken } from "@/lib/auth-storage";
import { ToastAction } from "@/components/ui/toast";

function socketOrigin(): string {
  const api = import.meta.env.VITE_API_URL?.trim();
  if (api) return api.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

const SocketCtx = createContext<Socket | null>(null);

export function useNotificationSocket(): Socket | null {
  return useContext(SocketCtx);
}

export function NotificationSocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const navigateNotification = useNotificationNavigate();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!user) {
      setSocket((prev) => {
        prev?.disconnect();
        return null;
      });
      return;
    }

    const token = getAuthToken();
    if (!token) return;

    const s = io(socketOrigin(), {
      path: "/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    setSocket(s);

    s.on("connect", () => {
      pushLog("info", "socket_connect", "Socket connected", { id: s.id, origin: socketOrigin() });
    });
    s.on("disconnect", (reason) => {
      pushLog("debug", "socket_disconnect", "Socket disconnected", { reason });
    });
    s.on("connect_error", (err) => {
      pushLog("warn", "socket_error", err?.message ?? "connect_error", err);
    });

    const onNew = () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };

    s.on(
      "notification:new",
      (payload: {
        title?: string;
        message?: string;
        notificationType?: string;
        module?: string | null;
        metadata?: unknown;
      }) => {
        pushLog("info", "socket_notification", "In-app notification (socket)", { title: payload.title });
        onNew();
        const href = notificationPayloadHref(payload);
        toast({
          title: payload.title ?? "Notification",
          description: payload.message,
          action: href ? (
            <ToastAction
              altText="Open"
              onClick={() =>
                navigateNotification({
                  metadata: payload.metadata,
                  notificationType: payload.notificationType,
                  module: payload.module,
                })
              }
            >
              Open
            </ToastAction>
          ) : undefined,
        });
      },
    );

    return () => {
      s.off("notification:new");
      s.disconnect();
      setSocket(null);
    };
  }, [user?.id, queryClient, toast, navigateNotification]);

  useEffect(() => {
    if (!user) return;

    let unsub: (() => void) | null = null;

    const detachSwLog = attachServiceWorkerPushLogListener();

    const run = async () => {
      if (isWebPushConfigured() && Notification.permission === "default") {
        const p = await Notification.requestPermission();
        pushLog("info", "permission_prompt", `User responded: ${p}`);
        if (p === "granted") await registerWebPush().catch(() => undefined);
      } else if (isWebPushConfigured() && Notification.permission === "granted") {
        await registerWebPush().catch(() => undefined);
      } else if (isWebPushConfigured()) {
        pushLog("warn", "permission_denied", "Notifications blocked in browser settings");
      }

      unsub = onForegroundMessage((payload) => {
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
        const title = payload.notification?.title ?? "Notification";
        const body = payload.notification?.body;
        const href =
          payload.data?.actionPath?.trim() ||
          notificationPayloadHref({
            metadata: {
              actionPath: payload.data?.actionPath,
              orderId: payload.data?.orderId ? Number(payload.data.orderId) : undefined,
              complaintId: payload.data?.complaintId ? Number(payload.data.complaintId) : undefined,
              purchaseOrderId: payload.data?.purchaseOrderId
                ? Number(payload.data.purchaseOrderId)
                : undefined,
            },
            notificationType: payload.data?.type,
            module: payload.data?.module ?? null,
          });
        toast({
          title,
          description: body,
          action: href ? (
            <ToastAction altText="Open" onClick={() => navigateNotification({ metadata: { actionPath: href } })}>
              Open
            </ToastAction>
          ) : undefined,
        });
        void showSystemNotification(payload);
        pushLog("info", "realtime_notification", "Handled FCM for app notification", {
          title,
          type: payload.data?.type,
          notificationId: payload.data?.notificationId,
        });
      });
    };

    void run();

    return () => {
      detachSwLog();
      unsub?.();
    };
  }, [user?.id, queryClient, toast, navigateNotification]);

  return <SocketCtx.Provider value={socket}>{children}</SocketCtx.Provider>;
}
