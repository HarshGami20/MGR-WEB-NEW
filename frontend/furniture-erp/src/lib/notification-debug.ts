/** Set `VITE_DEBUG_NOTIFICATIONS=true` in `.env` for verbose logs in production builds; in dev, logs when `import.meta.env.DEV` is true. */
export function notifyDebug(...args: unknown[]): void {
  const forced = import.meta.env.VITE_DEBUG_NOTIFICATIONS === "true";
  if (!forced && !import.meta.env.DEV) return;
  console.log("[Notifications]", ...args);
}

export function notifyWarn(...args: unknown[]): void {
  console.warn("[Notifications]", ...args);
}
