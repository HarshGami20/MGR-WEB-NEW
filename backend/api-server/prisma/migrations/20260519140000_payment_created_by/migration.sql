-- AlterTable
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "created_by_id" INTEGER;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_created_by_id_fkey'
  ) THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
