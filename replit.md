# Workspace

## Overview

Full-stack Furniture Inventory and Order Management ERP system. A complete business management platform for furniture companies with role-based access control, GST/non-GST billing, inventory tracking, supplier/manufacturer management, and comprehensive reporting.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Auth**: JWT (bcryptjs + jsonwebtoken), stored in localStorage

## Artifacts

- **furniture-erp** — Main React frontend ERP app (preview path: `/`)
- **api-server** — Express backend API (preview path: `/api`)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Default Login Credentials

- **Mobile**: `9999999999`
- **Password**: `admin123`
- **Role**: Super Admin (full access)

## Modules

1. **Auth** — JWT login with mobile + password, role-based access
2. **Users** — Create/manage users, assign roles, toggle active, reset passwords
3. **Roles** — Custom roles with module-level CRUD permissions
4. **Products** — CRUD with SKU, GST%, stock qty, low-stock alerts
5. **Categories** — Hierarchical categories and subcategories
6. **Inventory** — Stock tracking, in/out/adjustment logs, low-stock alerts
7. **Orders** — GST & non-GST orders, line items, status workflow
8. **Invoices** — Auto-generated from orders, GST breakdown (CGST/SGST/IGST)
9. **Payments** — Cash/bank transfer/UPI, partial & full payment tracking
10. **Suppliers** — Supplier management with contact details
11. **Manufacturers** — Manufacturer panel with specialization tracking
12. **Purchase Orders** — Supplier and manufacturer POs, auto-stock update on delivery
13. **Dashboard** — KPI cards, sales chart, order status breakdown, recent orders
14. **Settings** — Company details, GST config, invoice prefix

## Database Schema

Tables: roles, users, categories, products, inventory_logs, orders, order_items, invoices, payments, suppliers, manufacturers, purchase_orders, purchase_order_items, settings

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
