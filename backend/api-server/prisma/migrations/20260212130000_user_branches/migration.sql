-- CreateTable
CREATE TABLE "user_branches" (
    "user_id" INTEGER NOT NULL,
    "branch_id" INTEGER NOT NULL,

    CONSTRAINT "user_branches_pkey" PRIMARY KEY ("user_id","branch_id")
);

-- CreateIndex
CREATE INDEX "user_branches_branch_id_idx" ON "user_branches"("branch_id");

-- AddForeignKey
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from legacy users.branch_id
INSERT INTO "user_branches" ("user_id", "branch_id")
SELECT "id", "branch_id" FROM "users" WHERE "branch_id" IS NOT NULL
ON CONFLICT DO NOTHING;
