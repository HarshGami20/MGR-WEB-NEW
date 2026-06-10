-- AlterTable
ALTER TABLE "inventory_logs" ADD COLUMN IF NOT EXISTS "user_id" INTEGER;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_logs_user_id_fkey'
  ) THEN
    ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
