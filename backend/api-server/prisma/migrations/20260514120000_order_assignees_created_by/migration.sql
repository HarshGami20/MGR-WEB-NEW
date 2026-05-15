-- Track who created an order (for "Created by me" filters).
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "created_by_id" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_created_by_id_fkey'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Many-to-many: order ↔ assignees (keeps legacy assigned_to_id in sync from app layer).
CREATE TABLE IF NOT EXISTS "order_assignees" (
    "order_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "order_assignees_pkey" PRIMARY KEY ("order_id","user_id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_assignees_order_id_fkey'
  ) THEN
    ALTER TABLE "order_assignees"
      ADD CONSTRAINT "order_assignees_order_id_fkey"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_assignees_user_id_fkey'
  ) THEN
    ALTER TABLE "order_assignees"
      ADD CONSTRAINT "order_assignees_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "order_assignees_user_id_idx" ON "order_assignees"("user_id");

INSERT INTO "order_assignees" ("order_id", "user_id")
SELECT "id", "assigned_to_id" FROM "orders" WHERE "assigned_to_id" IS NOT NULL
ON CONFLICT ("order_id", "user_id") DO NOTHING;
