-- CreateTable
CREATE TABLE "delivery_slots" (
    "id" SERIAL NOT NULL,
    "branch_id" INTEGER NOT NULL,
    "slot_date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "max_orders" INTEGER NOT NULL,
    "service_pincodes" TEXT NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_slots_branch_id_slot_date_idx" ON "delivery_slots"("branch_id", "slot_date");

-- AddForeignKey
ALTER TABLE "delivery_slots" ADD CONSTRAINT "delivery_slots_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivery_slot_id" INTEGER,
ADD COLUMN     "delivery_status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "customer_pincode" TEXT,
ADD COLUMN     "address_lat" DECIMAL(11,8),
ADD COLUMN     "address_lng" DECIMAL(11,8),
ADD COLUMN     "google_place_id" TEXT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_slot_id_fkey" FOREIGN KEY ("delivery_slot_id") REFERENCES "delivery_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate legacy main status
UPDATE "orders" SET "status" = 'complete' WHERE "status" = 'delivered';
