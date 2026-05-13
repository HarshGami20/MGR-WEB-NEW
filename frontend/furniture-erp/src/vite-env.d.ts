/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** If set, API base URL; otherwise use Vite dev proxy for `/api` (see vite.config.ts). */
  readonly VITE_API_URL?: string;
  /** Web Push / FCM (optional). Same values as Firebase console → Project settings → Web app. */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** Cloud Messaging → Web Push certificates → Key pair */
  readonly VITE_FIREBASE_VAPID_KEY?: string;
  /** Set `true` for verbose `[Notifications]` console logs even in production build */
  readonly VITE_DEBUG_NOTIFICATIONS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
