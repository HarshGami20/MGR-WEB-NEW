/**
 * Client-side web push event log (console + in-memory buffer for UI).
 * Enable verbose logs: VITE_DEBUG_NOTIFICATIONS=true or dev mode.
 */

export type PushLogLevel = "debug" | "info" | "warn" | "error";

export type PushLogEntry = {
  id: string;
  at: string;
  level: PushLogLevel;
  event: string;
  message: string;
  detail?: unknown;
};

const MAX_ENTRIES = 200;
const entries: PushLogEntry[] = [];
const listeners = new Set<() => void>();

function isVerbose(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_DEBUG_NOTIFICATIONS === "true";
}

function shouldLog(level: PushLogLevel): boolean {
  if (level === "warn" || level === "error") return true;
  return isVerbose();
}

function emitChange(): void {
  listeners.forEach((fn) => fn());
}

function formatDetail(detail: unknown): string {
  if (detail == null) return "";
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export function pushLog(
  level: PushLogLevel,
  event: string,
  message: string,
  detail?: unknown,
): void {
  const entry: PushLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    level,
    event,
    message,
    detail,
  };

  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  emitChange();

  if (!shouldLog(level)) return;

  const prefix = `[WebPush] ${event}`;
  const extra = detail !== undefined ? formatDetail(detail) : "";
  if (level === "error") console.error(prefix, message, extra || "");
  else if (level === "warn") console.warn(prefix, message, extra || "");
  else if (level === "debug") console.debug(prefix, message, detail ?? "");
  else console.info(prefix, message, detail ?? "");
}

export function getPushLogs(): PushLogEntry[] {
  return [...entries];
}

export function clearPushLogs(): void {
  entries.length = 0;
  emitChange();
}

export function subscribePushLogs(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Listen for logs posted from firebase-messaging-sw.js */
export function attachServiceWorkerPushLogListener(): () => void {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return () => undefined;

  const onMessage = (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "WEB_PUSH_LOG") {
      pushLog(
        (data.level as PushLogLevel) ?? "info",
        String(data.event ?? "sw"),
        String(data.message ?? "Service worker event"),
        data.detail,
      );
    }
  };

  navigator.serviceWorker.addEventListener("message", onMessage);
  return () => navigator.serviceWorker.removeEventListener("message", onMessage);
}

declare global {
  interface Window {
    __MGR_WEB_PUSH_LOGS__?: () => PushLogEntry[];
  }
}

if (typeof window !== "undefined") {
  window.__MGR_WEB_PUSH_LOGS__ = getPushLogs;
}
