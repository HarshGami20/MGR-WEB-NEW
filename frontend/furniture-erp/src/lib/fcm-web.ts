import { initializeApp, type FirebaseApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage, type Messaging } from "firebase/messaging";
import { saveFcmToken } from "@/lib/notification-api";
import { notifyDebug, notifyWarn } from "@/lib/notification-debug";

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
  notifyDebug("registerWebPush: starting");
  if (!(await isSupported())) {
    notifyWarn("registerWebPush: Firebase messaging not supported in this browser");
    return;
  }
  const cfg = firebaseConfigFromEnv();
  const vapidKey = envStr("VITE_FIREBASE_VAPID_KEY");
  const fb = ensureFirebaseApp();
  if (!fb || !cfg || !vapidKey) {
    notifyDebug("registerWebPush: skipped (missing firebase env or VAPID)");
    return;
  }

  if (looksLikeInvalidVapidKey(vapidKey)) {
    notifyWarn(
      "VITE_FIREBASE_VAPID_KEY looks wrong (e.g. Google Analytics `G-...`). " +
        "Use Firebase Console → Cloud Messaging → Web Push certificates → Key pair.",
    );
    return;
  }

  try {
    const reg =
      (await navigator.serviceWorker.getRegistration()) ??
      (await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" }));

    await navigator.serviceWorker.ready;
    const active = reg.active ?? reg.installing ?? reg.waiting;
    active?.postMessage({ type: "INIT_FIREBASE", config: cfg });

    messaging = getMessaging(fb);
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    if (!token) {
      notifyWarn("getToken returned empty — check VAPID key and Firebase Web app config.");
      return;
    }

    notifyDebug("FCM token obtained, registering with API", { tokenLength: token.length });
    await saveFcmToken({ token, platform: "web", deviceId: "web" });
    notifyDebug("FCM token saved to backend");
  } catch (e) {
    notifyWarn("registerWebPush failed:", e);
  }
}

export function onForegroundMessage(
  cb: (payload: { notification?: { title?: string; body?: string }; data?: Record<string, string> }) => void,
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
  return onMessage(messaging, (payload) => cb(payload));
}
