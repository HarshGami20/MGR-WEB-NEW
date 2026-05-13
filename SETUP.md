# Blue Schema Manager — setup guide

This project uses **PostgreSQL** as the primary database (via Prisma). The backend `DATABASE_URL` must point to PostgreSQL, not MySQL. If you previously used MySQL, create a PostgreSQL instance and either run fresh migrations (`db push` / `migrate`) or migrate data separately—Prisma cannot use MySQL and PostgreSQL interchangeably with the same schema without adjusting `provider` and SQL types.

---

## 1. Prerequisites

| Tool | Purpose |
|------|---------|
| **Node.js** (LTS) or **Bun** | Run backend and frontend |
| **PostgreSQL** 14+ | Main application database |
| **Redis** (optional but recommended) | BullMQ notification worker, Socket.IO Redis adapter, socket bridge between API and worker processes |

---

## 2. Redis — local setup (step by step)

Redis is **optional**: the API runs without it, but with Redis you get **BullMQ** (queued FCM batches), **Socket.IO Redis adapter** (multiple API instances), and the **Redis Pub/Sub bridge** so the notification worker can trigger socket emissions.

### Step 1 — Install Redis

**macOS (Homebrew)**

1. Install Redis:

   ```bash
   brew install redis
   ```

2. Start it **one** of these ways:
   - **Background service** (starts again after reboot):

     ```bash
     brew services start redis
     ```

   - **Foreground** (terminal stays open; good for debugging):

     ```bash
     redis-server
     ```

**Docker (macOS, Linux, Windows)**

1. Run a container (default port **6379**):

   ```bash
   docker run -d --name redis-local -p 6379:6379 redis:7-alpine
   ```

2. Optional: stop/remove later with `docker stop redis-local` / `docker rm redis-local`.

**Windows (without Docker)**

- Use [Memurai](https://www.memurai.com/) (Redis-compatible) or install Redis via WSL2 + Ubuntu, then use the same `redis-server` / `redis-cli` commands as Linux.

### Step 2 — Verify Redis is listening

```bash
redis-cli ping
```

Expected reply: **`PONG`**.  
If `redis-cli` is not in your PATH (some Docker setups), use:

```bash
docker exec -it redis-local redis-cli ping
```

### Step 3 — Connection URL for this project

Default local address:

```text
redis://127.0.0.1:6379
```

No password is assumed for local dev. If you enable a password in `redis.conf`, use:

```text
redis://:YOUR_PASSWORD@127.0.0.1:6379
```

### Step 4 — Add to backend `.env`

In `backend/api-server/.env`:

```env
REDIS_URL=redis://127.0.0.1:6379
```

Save the file and **restart** the API server so it picks up the variable.

### Step 5 — Run the notification worker (optional but recommended with Redis)

After Redis is up and `REDIS_URL` is set:

```bash
cd backend/api-server
npm run build
npm run worker:notifications
```

Keep this process running in its own terminal while developing queued pushes and scheduled jobs.

### Troubleshooting

| Problem | What to try |
|--------|-------------|
| `ECONNREFUSED` / connection refused | Redis is not running — run `brew services start redis`, `redis-server`, or start the Docker container. |
| Port **6379** already in use | Another Redis or app owns the port. Either stop the other process, or map Docker to another host port, e.g. `-p 6380:6379`, then set `REDIS_URL=redis://127.0.0.1:6380`. |
| Worker exits immediately | Ensure `REDIS_URL` is set and Redis responds to `redis-cli ping`. |
| macOS permission / Homebrew errors | Update Homebrew (`brew update`) and retry `brew install redis`. |

---
ggggggggfds
## 3. PostgreSQL database

1. Install PostgreSQL locally or use a hosted instance (RDS, Supabase, Neon, etc.).
2. Create an empty database, for example `furniture-erp`:
gg
   ```sql
   CREATE DATABASE "furniture-erp";
   ```

3. Connection string format:

   ```text
   postgresql://USER:PASSWORD@HOST:5432/DATABASE_NAME?schema=public
   ```

   Example local:

   ```text
   postgresql://postgres:yourpassword@localhost:5432/furniture-erp?schema=public
   ```

---

## 4. Backend (`backend/api-server`)

### 4.1 Install and Prisma

```bash
cd backend/api-server
npm install
npx prisma generate
```

### 4.2 Environment file

Copy or create `.env` (never commit real secrets). Variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Yes | HTTP port (e.g. `8080`). Socket.IO uses the **same** port. |
| `DATABASE_URL` | Yes | PostgreSQL URL (see §3). |
| `SESSION_SECRET` | Yes | Strong secret for JWT signing. |
| `LOG_LEVEL` | Optional | Pino log level: `info` (default), `debug` (shows socket room + emit details for notifications). |
| `REDIS_URL` | Optional | e.g. `redis://127.0.0.1:6379` — enables BullMQ push queue, Socket.IO scaling adapter, Redis socket bridge for workers. Without it, queues are skipped and scheduled/socket-from-worker behavior is limited. |
| `SOCKET_BRIDGE_CHANNEL` | Optional | Redis Pub/Sub channel name for socket bridge (default is fine). |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Optional | Full JSON of Firebase service account as a **single-line** env string for FCM. Alternative: set `GOOGLE_APPLICATION_CREDENTIALS` to a path of the JSON file. |
| `SESSION_SECRET` | Same as JWT — keep consistent across deploys. |

### 4.3 Apply schema to Postgres

```bash
npx prisma db push
```

For production, prefer versioned migrations:

```bash
npx prisma migrate dev
```

### 4.4 Seed (optional)

```bash
npm run seed
```

Default demo login (if unchanged by seed): mobile **`9999999999`**, password **`admin123`** — confirm in `prisma/seed.ts` if needed.

### 4.5 Run API

```bash
npm run dev
```

API base path: `/api`.

### 4.6 Notification worker (when using Redis + FCM queues)

In a **second terminal**:

```bash
npm run build
npm run worker:notifications
```

Without Redis, push batch jobs are not queued; configure `REDIS_URL` first.

---

## 5. Frontend (`frontend/furniture-erp`)

### 5.1 Install

```bash
cd frontend/furniture-erp
npm install
```

### 5.2 Environment (optional)

Create `.env` in `frontend/furniture-erp` if needed:

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | If set, API calls go to this host (e.g. production API). If unset in dev, Vite proxies `/api` and `/socket.io` to the backend (see `vite.config.ts`). |
| `VITE_API_PROXY_TARGET` | Dev/proxy target (default `http://127.0.0.1:8080`) — must match backend `PORT`. |
| `PORT` | Vite dev server port (default `5173`). |

**Web Push (FCM) — optional:**

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase Web app config |
| `VITE_FIREBASE_AUTH_DOMAIN` | |
| `VITE_FIREBASE_PROJECT_ID` | |
| `VITE_FIREBASE_STORAGE_BUCKET` | |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | |
| `VITE_FIREBASE_APP_ID` | |
| `VITE_FIREBASE_VAPID_KEY` | Web Push certificate key pair from Firebase Console |

Without Firebase env vars, **in-app + Socket.IO notifications still work**; browser push is skipped.

### 5.3 Dev server

```bash
npm run dev
```

Open the printed URL in the browser. Login and use the notification bell; ensure backend is running so `/api` and `/socket.io` proxy correctly.

### 5.4 Chrome Web Push (Firebase) — what it is and how to set it up

**What it does:** Chrome (and other Chromium browsers) can show **system notifications** when the tab is in the background or closed, using the **Web Push** standard. This project uses **Firebase Cloud Messaging (FCM)** as the push provider: the browser gets a device token, your **Express API** stores it and sends pushes via **Firebase Admin**, and the **service worker** (`public/firebase-messaging-sw.js`) can show notifications when the app is not in the foreground.

**What you need:** a **Firebase project** (free tier is enough for development), a **Web app** registered in that project, a **VAPID / Web Push key pair** in the Firebase console, and a **service account JSON** on the server for sending.

#### A. Firebase Console (one-time)

1. Open [Firebase Console](https://console.firebase.google.com/) → **Add project** (or pick an existing project).
2. In the project, click the **Web** icon (`</>`) to **Add app** → **Web**. Register the app (nickname only). Copy the **`firebaseConfig`** object — you will map it to `VITE_*` variables (see below).
3. Enable **Cloud Messaging**:
   - **Project settings** (gear) → **Cloud Messaging** tab.
   - Under **Firebase Cloud Messaging API (V1)** ensure it is enabled (Google Cloud Console link if needed).
4. **Web Push certificates (VAPID key)** — required for Chrome `getToken`:
   - Same **Project settings** → **Cloud Messaging** → section **Web Push certificates**.
   - If empty, click **Generate key pair**. Copy the **Key pair** string — this is `VITE_FIREBASE_VAPID_KEY`.
5. **Service account (backend sends pushes):**
   - **Project settings** → **Service accounts**.
   - Click **Generate new private key** → download the JSON file.
   - **Never commit this file.** On the server you can either:
     - Set `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccount.json`, or
     - Put the entire JSON **minified on one line** in `FIREBASE_SERVICE_ACCOUNT_JSON` in `backend/api-server/.env` (works well on PaaS).

#### B. Frontend env (`frontend/furniture-erp/.env`)

Create or extend `.env` (restart Vite after changes):

```env
# From Firebase Console → Project settings → Your apps → Web app config
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Cloud Messaging → Web Push certificates → Key pair
VITE_FIREBASE_VAPID_KEY=
```

The code in `src/lib/fcm-web.ts` only enables Web Push when **all** of the above (including VAPID) are present. After login, the app requests notification permission and registers the token with `POST /api/notifications/fcm-token`.

#### C. Backend env (`backend/api-server/.env`)

```env
# Option 1 — path to downloaded service account JSON
GOOGLE_APPLICATION_CREDENTIALS=/full/path/to/serviceAccount.json

# Option 2 — entire JSON as one line (no newlines inside the string)
# FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

Without one of these, **FCM send from the server is skipped** (in-app + Socket.IO still work).

#### D. URLs Chrome will accept

- **Local dev:** `http://localhost` and `http://127.0.0.1` are treated as secure origins for Web Push.
- **Production:** Your site must be served over **HTTPS** (required for service workers and push outside localhost).

#### E. Files already in this repo (no extra code needed for basic Chrome push)

| Path | Role |
|------|------|
| `frontend/furniture-erp/public/firebase-messaging-sw.js` | Background messages; receives Firebase config via `postMessage` from the page. |
| `frontend/furniture-erp/src/lib/fcm-web.ts` | Requests permission, `getToken`, registers token with API, foreground `onMessage`. |
| `frontend/furniture-erp/src/lib/notification-socket.tsx` | Calls `registerWebPush()` when env is complete. |
| `backend/api-server/src/lib/firebase-admin.ts` | Sends multicast FCM from the notification pipeline. |
| `backend/api-server/src/routes/notifications.ts` | `POST /api/notifications/fcm-token` stores the browser token in Postgres. |

#### F. Verify it works

1. Set all env vars; restart API and `npm run dev` for the frontend.
2. Open the app in **Chrome**, log in, **Allow** notifications when prompted.
3. In Chrome DevTools → **Application** → **Service Workers**, confirm `firebase-messaging-sw.js` is registered.
4. Trigger a notification that uses push (e.g. assignee notification on order create, or Super Admin broadcast). You should see a **system notification** when the tab is in the background; with the tab focused, foreground handling shows a toast.

**Note:** iOS Safari has different push rules; this section targets **Chrome desktop / Android Chrome** via FCM Web Push.

#### G. Push not showing — checklist

| Symptom | Likely cause |
|---------|----------------|
| Browser console: `[FCM] VITE_FIREBASE_VAPID_KEY looks wrong` | The **Web Push key** was confused with **Google Analytics** (`G-xxxxxxxx`). Use Firebase Console → **Cloud Messaging** → **Web Push certificates** → **Key pair** (long string). |
| No `POST /api/notifications/fcm-token` in Network tab | Missing/invalid VAPID or Firebase web config; permission denied; fix `.env` and hard-refresh. |
| Token saves but no push arrives | With **`REDIS_URL` set**, FCM jobs go to **BullMQ**. Either run **`npm run worker:notifications`** after `npm run build`, **or** set **`NOTIFICATION_PUSH_INLINE=true`** in `backend/api-server/.env` so the API sends FCM without the worker (fine for local dev). |
| Backend logs: Firebase Admin not configured | **`GOOGLE_APPLICATION_CREDENTIALS`** path wrong or JSON missing; API cannot send FCM. |

---

## 6. Quick checklist

- [ ] PostgreSQL running and database created  
- [ ] `DATABASE_URL` points to PostgreSQL  
- [ ] `npx prisma db push` (or migrate) succeeded  
- [ ] `PORT` and frontend proxy target match  
- [ ] `SESSION_SECRET` set  
- [ ] (Optional) `REDIS_URL`: run `worker:notifications` **or** set `NOTIFICATION_PUSH_INLINE=true` for local FCM without a worker — see §5.4G  
- [ ] (Optional) Chrome Web Push: Firebase project + `VITE_FIREBASE_*` + `VITE_FIREBASE_VAPID_KEY` (frontend); `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON` (backend) — see §5.4  

---

## 7. MySQL vs PostgreSQL note

This codebase’s Prisma `provider` is **`postgresql`**. Using MySQL would require changing `schema.prisma`, adjusting types Prisma maps differently (e.g. enums, JSON), and re-running migrations—it is not a drop-in URL swap. **Stay on PostgreSQL** unless you have a strong reason to maintain MySQL separately.
