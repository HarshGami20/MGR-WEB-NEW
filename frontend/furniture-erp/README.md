# MGR Casa (frontend)

Standalone React app. API hooks and types live in `src/api-client/` (generated from `openapi/openapi.yaml`).

## Setup

```bash
cd frontend/furniture-erp
npm install
```

## Environment

Vite requires:

- `PORT` — dev server port (e.g. `5173`)
- `BASE_PATH` — app base URL (e.g. `/`)

The API client calls **relative** URLs like `/api/...`. In the browser that would normally hit the Vite dev server (`localhost:5173`), so we **proxy** `/api` to your Express app.

- **`VITE_API_PROXY_TARGET`** (optional) — backend base URL for the dev/preview proxy. Default: `http://127.0.0.1:3000` (match your API `PORT`).
- **`VITE_API_URL`** (optional) — if set, requests go **directly** to this host (no proxy). Use when the API is on another machine or you prefer explicit URLs; backend CORS must allow the frontend origin.

Example (proxy — recommended local dev):

```bash
export PORT=5173
export BASE_PATH=/
export VITE_API_PROXY_TARGET=http://127.0.0.1:3000   # same as API PORT
npm run dev
```

Example (direct API URL, skip proxy):

```bash
export VITE_API_URL=http://127.0.0.1:3000
npm run dev
```

## Regenerate API client (optional)

After editing `openapi/openapi.yaml`:

```bash
npm run codegen
```

## Build

```bash
npm run build
npm run serve
```
