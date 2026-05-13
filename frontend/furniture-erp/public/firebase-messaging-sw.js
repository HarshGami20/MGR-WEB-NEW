/* eslint-disable no-undef */
/**
 * FCM background handler. Config is sent from the app after load via postMessage
 * (see `registerWebPush` in `src/lib/fcm-web.ts`) so keys are not duplicated in source.
 */
importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js");

let messagingStarted = false;

self.addEventListener("message", (event) => {
  if (event.data?.type !== "INIT_FIREBASE" || !event.data.config) return;
  if (messagingStarted) return;
  messagingStarted = true;

  if (!firebase.apps.length) {
    firebase.initializeApp(event.data.config);
  }

  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || "Notification";
    const body = payload.notification?.body || "";
    self.registration.showNotification(title, {
      body,
      data: payload.data || {},
    });
  });
});
