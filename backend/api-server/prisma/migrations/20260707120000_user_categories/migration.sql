ALTER TABLE "users" ADD COLUMN "all_categories" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "user_categories" (
    "user_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,

    CONSTRAINT "user_categories_pkey" PRIMARY KEY ("user_id","category_id")
);

ALTER TABLE "user_categories" ADD CONSTRAINT "user_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_categories" ADD CONSTRAINT "user_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
