-- Order-level category (main category) for reporting and classification
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "category_id" INTEGER;

ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_category_id_fkey";
ALTER TABLE "orders" ADD CONSTRAINT "orders_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "orders_category_id_idx" ON "orders"("category_id");
