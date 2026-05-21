ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_charge" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "driver_id" INTEGER;

CREATE TABLE IF NOT EXISTS "drivers" (
    "id" SERIAL NOT NULL,
    "branch_id" INTEGER,
    "name" TEXT NOT NULL,
    "mobile" TEXT,
    "vehicle_info" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "driver_payments" (
    "id" SERIAL NOT NULL,
    "driver_id" INTEGER NOT NULL,
    "order_id" INTEGER,
    "branch_id" INTEGER,
    "amount" DECIMAL(12,2) NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'cash',
    "reference" TEXT,
    "notes" TEXT,
    "paid_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_payments_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_driver_id_fkey') THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_driver_id_fkey"
      FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drivers_branch_id_fkey') THEN
    ALTER TABLE "drivers"
      ADD CONSTRAINT "drivers_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_payments_driver_id_fkey') THEN
    ALTER TABLE "driver_payments"
      ADD CONSTRAINT "driver_payments_driver_id_fkey"
      FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_payments_order_id_fkey') THEN
    ALTER TABLE "driver_payments"
      ADD CONSTRAINT "driver_payments_order_id_fkey"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_payments_branch_id_fkey') THEN
    ALTER TABLE "driver_payments"
      ADD CONSTRAINT "driver_payments_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_payments_created_by_id_fkey') THEN
    ALTER TABLE "driver_payments"
      ADD CONSTRAINT "driver_payments_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "drivers_branch_id_idx" ON "drivers"("branch_id");
CREATE INDEX IF NOT EXISTS "driver_payments_driver_id_idx" ON "driver_payments"("driver_id");
CREATE INDEX IF NOT EXISTS "driver_payments_order_id_idx" ON "driver_payments"("order_id");
