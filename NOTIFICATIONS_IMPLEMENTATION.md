# Notifications & realtime — implementation summary

This document lists **what was added or changed** for the enterprise-style notification system (PostgreSQL + Prisma, Socket.IO, optional Redis/BullMQ/FCM, Express REST). Paths are relative to `Blue-Schema-Manager/`.

---

## 1. Database (PostgreSQL via Prisma)

| File | What changed |
|------|----------------|
| [`backend/api-server/prisma/schema.prisma`](backend/api-server/prisma/schema.prisma) | Added enum `NotificationPriority` and models: `Notification`, `NotificationRecipient`, `UserFcmToken`, `NotificationPreference`, `NotificationLog`, `NotificationTypeDefinition`. Extended `User` with relations to notifications / tokens / preferences. |

Apply schema: `npx prisma db push` (or migrate) from `backend/api-server`.

---

## 2. Backend — HTTP server & Socket.IO

| File | What changed |
|------|----------------|
| [`backend/api-server/src/index.ts`](backend/api-server/src/index.ts) | Uses `http.createServer(app)` instead of `app.listen` alone; calls `attachSocketIo(server)` so HTTP and Socket.IO share one port. |
| [`backend/api-server/src/realtime/socket-server.ts`](backend/api-server/src/realtime/socket-server.ts) | Socket.IO server: JWT on handshake (`auth.token`), rooms `user:{id}`, `role:{id}`, `branch:{id}`, `broadcast`, typing relay stub, Redis adapter when Redis is configured. |
| [`backend/api-server/src/realtime/socket-registry.ts`](backend/api-server/src/realtime/socket-registry.ts) | `setSocketServer` / `getSocketServer` for accessing `io` from services. |
| [`backend/api-server/src/realtime/socket-bridge.ts`](backend/api-server/src/realtime/socket-bridge.ts) | Redis Pub/Sub bridge so worker/other processes can emit Socket.IO events via the API subscriber (`SOCKET_BRIDGE_CHANNEL`). |

---

## 3. Backend — Redis, Firebase, events

| File | What changed |
|------|----------------|
| [`backend/api-server/src/lib/redis-connection.ts`](backend/api-server/src/lib/redis-connection.ts) | `createRedisClient`, `getRedisPublisher` for BullMQ, Socket.IO adapter, and socket bridge. |
| [`backend/api-server/src/lib/firebase-admin.ts`](backend/api-server/src/lib/firebase-admin.ts) | Lazy Firebase Admin init for FCM (`FIREBASE_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS`). |
| [`backend/api-server/src/lib/app-events.ts`](backend/api-server/src/lib/app-events.ts) | Lightweight `EventEmitter` (`appEvents`) for domain events (`ORDER_CREATED`, etc.). |

---

## 4. Backend — Notification service & queue

| File | What changed |
|------|----------------|
| [`backend/api-server/src/services/notification-service.ts`](backend/api-server/src/services/notification-service.ts) | Core API: `sendToUser`, `sendToUsers`, `sendToRole`, `sendBroadcast`, socket + push delivery, preferences, `markAsRead`, `markAllRead`, `deleteNotification`, FCM token save/remove, `deliverScheduledNotification`, `flushPushBatch` (used by worker). |
| [`backend/api-server/src/queues/notification-queue.ts`](backend/api-server/src/queues/notification-queue.ts) | BullMQ queue `mgr-notifications`: `push_batch`, `scheduled_notification` jobs. |
| [`backend/api-server/src/workers/notification-worker.ts`](backend/api-server/src/workers/notification-worker.ts) | Separate process entry: consumes queue jobs (push batches, scheduled notification delivery). |

---

## 5. Backend — Event listeners & routes

| File | What changed |
|------|----------------|
| [`backend/api-server/src/listeners/notification-listeners.ts`](backend/api-server/src/listeners/notification-listeners.ts) | Registers `ORDER_CREATED` → notify assignee/creator; `PAYMENT_RECEIVED` → notify order assignee when applicable. |
| [`backend/api-server/src/routes/notifications.ts`](backend/api-server/src/routes/notifications.ts) | REST: list notifications, unread count, mark read, mark all read, delete, FCM token register/remove, preferences GET/PATCH, Super Admin broadcast. Rate limits applied. |
| [`backend/api-server/src/routes/index.ts`](backend/api-server/src/routes/index.ts) | Mounts `notificationsRouter`. |
| [`backend/api-server/src/routes/orders.ts`](backend/api-server/src/routes/orders.ts) | After order create: `emitSafe("ORDER_CREATED", …)`. |
| [`backend/api-server/src/routes/payments.ts`](backend/api-server/src/routes/payments.ts) | After payment create: `emitSafe("PAYMENT_RECEIVED", …)`. |
| [`backend/api-server/src/middlewares/rate-limit-notifications.ts`](backend/api-server/src/middlewares/rate-limit-notifications.ts) | `express-rate-limit` presets for notification endpoints. |

---

## 6. Backend — Build & scripts

| File | What changed |
|------|----------------|
| [`backend/api-server/package.json`](backend/api-server/package.json) | Dependencies: `socket.io`, `@socket.io/redis-adapter`, `ioredis`, `bullmq`, `firebase-admin`, `express-rate-limit`; script `worker:notifications` pointing at built worker bundle. |
| [`backend/api-server/build.mjs`](backend/api-server/build.mjs) | Second esbuild entry: `src/workers/notification-worker.ts` → `dist/workers/notification-worker.mjs`. |

---

## 7. Frontend (furniture-erp)

| File | What changed |
|------|----------------|
| [`frontend/furniture-erp/vite.config.ts`](frontend/furniture-erp/vite.config.ts) | Proxy `/socket.io` to API with `ws: true` for Socket.IO during dev. |
| [`frontend/furniture-erp/src/vite-env.d.ts`](frontend/furniture-erp/src/vite-env.d.ts) | Types for optional `VITE_FIREBASE_*` and `VITE_FIREBASE_VAPID_KEY`. |
| [`frontend/furniture-erp/src/lib/notification-api.ts`](frontend/furniture-erp/src/lib/notification-api.ts) | REST helpers (`customFetch`) for notifications and FCM token. |
| [`frontend/furniture-erp/src/lib/fcm-web.ts`](frontend/furniture-erp/src/lib/fcm-web.ts) | Firebase Web SDK: token registration, foreground messages; posts config into service worker via `postMessage`. |
| [`frontend/furniture-erp/src/lib/notification-socket.tsx`](frontend/furniture-erp/src/lib/notification-socket.tsx) | `NotificationSocketProvider`: Socket.IO client + JWT, invalidates React Query on `notification:new`, optional FCM registration and foreground toasts. |
| [`frontend/furniture-erp/src/components/notification-bell.tsx`](frontend/furniture-erp/src/components/notification-bell.tsx) | Header bell, unread badge, dropdown list, mark read / mark all read, link to full page (hidden for partner portal users). |
| [`frontend/furniture-erp/src/pages/notifications.tsx`](frontend/furniture-erp/src/pages/notifications.tsx) | Notification center page with paginated “load more”. |
| [`frontend/furniture-erp/src/App.tsx`](frontend/furniture-erp/src/App.tsx) | Wraps app with `NotificationSocketProvider`; route `/notifications`. |
| [`frontend/furniture-erp/src/components/layout.tsx`](frontend/furniture-erp/src/components/layout.tsx) | Replaces static bell icon with `<NotificationBell />`. |
| [`frontend/furniture-erp/public/firebase-messaging-sw.js`](frontend/furniture-erp/public/firebase-messaging-sw.js) | Service worker: Firebase compat; initializes from `INIT_FIREBASE` message for background FCM. |

**Frontend dependencies** (see [`frontend/furniture-erp/package.json`](frontend/furniture-erp/package.json)): `socket.io-client`, `firebase`.

---

## 8. Documentation & samples

| File | Purpose |
|------|---------|
| [`SETUP.md`](SETUP.md) | Environment variables, Postgres, Redis, worker, frontend proxy, checklist. |
| [`backend/api-server/README.md`](backend/api-server/README.md) | Short backend README (includes typo fix `npm start`). |
| [`mobile/react-native-notification-sample.tsx`](mobile/react-native-notification-sample.tsx) | Reference snippet for RN FCM + Socket.IO (not wired into an app in this repo). |

---

## 9. Runtime overview

1. **API process**: Express + Prisma (PostgreSQL); Socket.IO attached to same HTTP server; optional Redis for Socket.IO adapter + Pub/Sub bridge + BullMQ producer.
2. **Worker process** (optional): `npm run worker:notifications` with `REDIS_URL` — processes FCM batches and scheduled notification jobs.
3. **Web app**: Vite proxies `/api` and `/socket.io`; bell + `/notifications` page; optional browser push when Firebase env vars are set.

---

## 10. Intentionally unchanged

- Core ERP modules (products, inventory, etc.) beyond **orders** and **payments** event hooks.
- Auth remains JWT via existing [`backend/api-server/src/middlewares/auth.ts`](backend/api-server/src/middlewares/auth.ts); sockets authenticate with the same token.

---

*Generated as a map of this notification/realtime implementation; adjust this file if you rename paths or add features.*
