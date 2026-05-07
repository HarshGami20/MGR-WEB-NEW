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

## Seed demo data

Clears existing rows and inserts roles, admin user, branch, settings, categories, products, sample order/invoice/payment, suppliers, and purchase orders.

```bash
npm run seed
```

Default login after seed: mobile **`9999999999`**, password **`admin123`**.

## Dev

```bash
npm run dev
```

## Production build

```bash
npm run build
npm startt
```

API routes are mounted under `/api`.
