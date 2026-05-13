import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { isWebPushConfigured, onForegroundMessage, registerWebPush } from "@/lib/fcm-web";
import { notifyDebug, notifyWarn } from "@/lib/notification-debug";

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
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!user) {
      setSocket((prev) => {
        prev?.disconnect();
        return null;
      });
      return;
    }

    const token = localStorage.getItem("erp_token");
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
      notifyDebug("socket.io connected", { id: s.id, origin: socketOrigin() });
    });
    s.on("disconnect", (reason) => {
      notifyDebug("socket.io disconnected", { reason });
    });
    s.on("connect_error", (err) => {
      notifyWarn("socket.io connect_error", err?.message ?? err);
    });

    const onNew = () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };

    s.on("notification:new", (payload: { title?: string; message?: string }) => {
      notifyDebug("notification:new (socket)", { title: payload.title });
      onNew();
      toast({
        title: payload.title ?? "Notification",
        description: payload.message,
      });
    });

    return () => {
      s.off("notification:new");
      s.disconnect();
      setSocket(null);
    };
  }, [user?.id, queryClient, toast]);

  useEffect(() => {
    if (!user) return;

    let unsub: (() => void) | null = null;

    const run = async () => {
      if (isWebPushConfigured() && Notification.permission === "default") {
        const p = await Notification.requestPermission();
        if (p === "granted") await registerWebPush().catch(() => undefined);
      } else if (isWebPushConfigured() && Notification.permission === "granted") {
        await registerWebPush().catch(() => undefined);
      }

      unsub = onForegroundMessage((payload) => {
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
        toast({
          title: payload.notification?.title ?? "Notification",
          description: payload.notification?.body,
        });
      });
    };

    void run();

    return () => {
      unsub?.();
    };
  }, [user?.id, queryClient, toast]);

  return <SocketCtx.Provider value={socket}>{children}</SocketCtx.Provider>;
}
