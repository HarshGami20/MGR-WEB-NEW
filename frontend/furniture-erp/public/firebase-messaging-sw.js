/* eslint-disable no-undef */
/**
 * FCM background handler. Config is sent from the app after load via postMessage
 * (see `registerWebPush` in `src/lib/fcm-web.ts`) so keys are not duplicated in source.
 */
importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js");

let messagingStarted = false;

function swLog(level, event, message, detail) {
  const prefix = "[WebPush SW]";
  const line = `${prefix} [${event}] ${message}`;
  if (level === "error") console.error(line, detail ?? "");
  else if (level === "warn") console.warn(line, detail ?? "");
  else console.info(line, detail ?? "");

  self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: "WEB_PUSH_LOG",
        level,
        event: `sw:${event}`,
        message,
        detail,
      });
    });
  });
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "INIT_FIREBASE" || !event.data.config) return;
  if (messagingStarted) return;
  messagingStarted = true;

  swLog("info", "init", "Firebase initialized in service worker");

  if (!firebase.apps.length) {
    firebase.initializeApp(event.data.config);
  }

  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || "Notification";
    const body = payload.notification?.body || "";
    swLog("info", "background_message", "Showing system notification", {
      title,
      body,
      data: payload.data,
    });
    self.registration.showNotification(title, {
      body,
      data: payload.data || {},
      tag: (payload.data && payload.data.type) || "fcm",
    });
  });
});

self.addEventListener("notificationclick", (event) => {
  swLog("info", "notification_click", "User clicked notification", {
    action: event.action,
    data: event.notification?.data,
  });
  event.notification.close();
});
