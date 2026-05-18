import { pushLog } from "@/lib/push-notification-log";

/** @deprecated Prefer pushLog — kept for existing call sites. */
export function notifyDebug(...args: unknown[]): void {
  const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  pushLog("debug", "legacy", msg, args.length > 1 ? args.slice(1) : undefined);
}

export function notifyWarn(...args: unknown[]): void {
  const msg = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
  pushLog("warn", "legacy", msg, args.length > 1 ? args.slice(1) : undefined);
}
