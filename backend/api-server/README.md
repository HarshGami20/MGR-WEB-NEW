# API server (backend)

Standalone Express + Prisma API.

## Setup

```bash
cd backend/api-server
npm install
npx prisma generate
```

## Environment

- `PORT` — HTTP port (e.g. `8080`)
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — JWT signing secret (use a strong value in production)

## Database

```bash
npx prisma db push
```

## Reset database — Super Admin only

Clears **all** data and creates one user with the **Super Admin** role (full permissions on every module). No branches, products, or demo data.

```bash
npm run seed:admin
```

Default login: mobile **`9999999999`**, password **`admin123`**.

Optional overrides:

```bash
SEED_ADMIN_NAME="Your Name" SEED_ADMIN_MOBILE="9876543210" SEED_ADMIN_PASSWORD="your-secure-password" npm run seed:admin
```

## Seed demo data

Clears existing rows and inserts roles, admin user, branches, settings, categories, products, sample orders, suppliers, and purchase orders.

```bash
npm run seed
```

Default login after full seed: mobile **`9999999999`**, password **`admin123`** (plus other demo users — see seed output).

## Dev

```bash
npm run dev
```

## Production build

```bash
npm run build
npm start
```

API routes are mounted under `/api`.
