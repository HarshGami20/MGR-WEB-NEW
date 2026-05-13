/**
 * Drop-in reference for a React Native app (not wired into this repo).
 * Install: @react-native-firebase/app @react-native-firebase/messaging socket.io-client
 *
 * - Call POST ${API}/api/notifications/fcm-token with Bearer token after getting FCM token.
 * - Connect Socket.IO with same JWT in handshake.auth.token as the web app.
 */
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import messaging from "@react-native-firebase/messaging";
import { io, type Socket } from "socket.io-client";

const API_BASE = "https://your-api.example.com"; // or __DEV__ localhost tunnel

async function registerDeviceToken(bearer: string, deviceToken: string) {
  await fetch(`${API_BASE}/api/notifications/fcm-token`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({
      token: deviceToken,
      platform: Platform.OS === "ios" ? "ios" : "android",
      deviceId: Platform.OS,
    }),
  });
}

export function useMgrNotifications(bearer: string | null) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!bearer) return;

    void (async () => {
      await messaging().requestPermission();
      const token = await messaging().getToken();
      await registerDeviceToken(bearer, token);

      const socket = io(API_BASE, {
        path: "/socket.io",
        transports: ["websocket"],
        auth: { token: bearer },
      });
      socketRef.current = socket;
      socket.on("notification:new", () => {
        /* merge into Zustand / React Query invalidation */
      });

      messaging().onMessage(async () => {
        /* foreground FCM — show in-app banner */
      });
      /* Register setBackgroundMessageHandler in index.js (outside React), per @react-native-firebase/messaging docs */
    })();

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [bearer]);
}
