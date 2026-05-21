CREATE TABLE IF NOT EXISTS "complaint_assignees" (
    "complaint_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "complaint_assignees_pkey" PRIMARY KEY ("complaint_id","user_id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'complaint_assignees_complaint_id_fkey'
  ) THEN
    ALTER TABLE "complaint_assignees"
      ADD CONSTRAINT "complaint_assignees_complaint_id_fkey"
      FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'complaint_assignees_user_id_fkey'
  ) THEN
    ALTER TABLE "complaint_assignees"
      ADD CONSTRAINT "complaint_assignees_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "complaint_assignees_user_id_idx" ON "complaint_assignees"("user_id");
