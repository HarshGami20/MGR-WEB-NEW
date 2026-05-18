import { initializeApp, type FirebaseApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage, type Messaging } from "firebase/messaging";
import { saveFcmToken } from "@/lib/notification-api";
import { pushLog } from "@/lib/push-notification-log";

/** Dotenv / Vite sometimes leaves wrapping quotes on values. */
function envStr(key: keyof ImportMetaEnv): string | undefined {
  const raw = import.meta.env[key];
  if (raw == null || typeof raw !== "string") return undefined;
  let v = raw.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v || undefined;
}

/** Web Push VAPID key from Firebase → Cloud Messaging → Web Push certificates (long base64-ish string). NOT a Google Analytics `G-...` ID. */
function looksLikeInvalidVapidKey(key: string): boolean {
  const k = key.trim();
  if (k.startsWith("G-") && k.length < 40) return true;
  if (k.startsWith("UA-")) return true;
  return false;
}

export function firebaseConfigFromEnv(): Record<string, string> | null {
  const apiKey = envStr("VITE_FIREBASE_API_KEY");
  const authDomain = envStr("VITE_FIREBASE_AUTH_DOMAIN");
  const projectId = envStr("VITE_FIREBASE_PROJECT_ID");
  const storageBucket = envStr("VITE_FIREBASE_STORAGE_BUCKET");
  const messagingSenderId = envStr("VITE_FIREBASE_MESSAGING_SENDER_ID");
  const appId = envStr("VITE_FIREBASE_APP_ID");
  if (!apiKey || !projectId || !messagingSenderId || !appId) return null;
  return {
    apiKey,
    authDomain: authDomain ?? `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: storageBucket ?? `${projectId}.appspot.com`,
    messagingSenderId,
    appId,
  };
}

export function isWebPushConfigured(): boolean {
  const vapid = envStr("VITE_FIREBASE_VAPID_KEY");
  return Boolean(firebaseConfigFromEnv() && vapid && !looksLikeInvalidVapidKey(vapid));
}

let messaging: Messaging | null = null;

function ensureFirebaseApp(): FirebaseApp | null {
  const cfg = firebaseConfigFromEnv();
  if (!cfg) return null;
  if (!getApps().length) {
    return initializeApp(cfg);
  }
  return getApps()[0]!;
}

/**
 * Registers FCM web token with the API when env is complete and permission granted.
 */
export async function registerWebPush(): Promise<void> {
  pushLog("debug", "register_start", "Starting web push registration");
  if (!(await isSupported())) {
    pushLog("warn", "unsupported", "Firebase messaging not supported in this browser");
    return;
  }
  const cfg = firebaseConfigFromEnv();
  const vapidKey = envStr("VITE_FIREBASE_VAPID_KEY");
  const fb = ensureFirebaseApp();
  if (!fb || !cfg || !vapidKey) {
    pushLog("debug", "register_skip", "Skipped — missing Firebase env or VAPID key");
    return;
  }

  if (looksLikeInvalidVapidKey(vapidKey)) {
    pushLog(
      "warn",
      "invalid_vapid",
      "VITE_FIREBASE_VAPID_KEY looks invalid (use Firebase Web Push key pair, not G- analytics ID)",
    );
    return;
  }

  pushLog("debug", "permission", `Notification.permission = ${Notification.permission}`);

  try {
    const reg =
      (await navigator.serviceWorker.getRegistration()) ??
      (await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" }));

    await navigator.serviceWorker.ready;
    const active = reg.active ?? reg.installing ?? reg.waiting;
    active?.postMessage({ type: "INIT_FIREBASE", config: cfg });
    pushLog("info", "sw_ready", "Service worker registered", {
      scope: reg.scope,
      state: active?.state,
    });

    messaging = getMessaging(fb);
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    if (!token) {
      pushLog("warn", "token_empty", "getToken returned empty — check VAPID and Firebase web app config");
      return;
    }

    pushLog("info", "token_obtained", "FCM token obtained", { tokenLength: token.length });
    await saveFcmToken({ token, platform: "web", deviceId: "web" });
    pushLog("info", "token_saved", "FCM token saved to backend");
  } catch (e) {
    pushLog("error", "register_failed", e instanceof Error ? e.message : String(e), e);
  }
}

export type FcmMessagePayload = {
  notification?: { title?: string; body?: string };
  data?: Record<string, string>;
};

/**
 * Chrome does not auto-show OS banners when the ERP tab is focused — FCM uses `onMessage` instead.
 * Call this to still show a system notification via the service worker (same as background path).
 */
export async function showSystemNotification(payload: FcmMessagePayload): Promise<void> {
  if (typeof window === "undefined" || Notification.permission !== "granted") {
    pushLog("debug", "system_notification_skip", "Skipped OS banner — permission not granted");
    return;
  }

  const title = payload.notification?.title ?? "Notification";
  const body = payload.notification?.body ?? "";

  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body,
      data: payload.data ?? {},
      tag: payload.data?.type ?? title,
      requireInteraction: false,
    });
    pushLog("info", "system_notification", "OS notification shown (foreground fallback)", { title, body });
  } catch (e) {
    pushLog("warn", "system_notification_failed", e instanceof Error ? e.message : String(e), e);
  }
}

export function onForegroundMessage(
  cb: (payload: FcmMessagePayload) => void,
): (() => void) | null {
  const fb = ensureFirebaseApp();
  if (!fb) return null;
  if (!messaging) {
    try {
      messaging = getMessaging(fb);
    } catch {
      return null;
    }
  }
  return onMessage(messaging, (payload) => {
    pushLog("info", "foreground_message", "FCM message while tab is focused", {
      title: payload.notification?.title,
      body: payload.notification?.body,
      data: payload.data,
    });
    cb(payload);
  });
}
