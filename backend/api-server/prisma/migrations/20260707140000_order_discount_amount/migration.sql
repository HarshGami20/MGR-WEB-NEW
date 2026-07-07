-- Order-level commercial discount (applied at order create/edit, separate from per-payment discounts).
ALTER TABLE "orders" ADD COLUMN "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
