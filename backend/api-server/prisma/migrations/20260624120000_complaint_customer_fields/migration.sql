-- Sales complaints without a linked order store customer contact details on the complaint.
ALTER TABLE "complaints" ADD COLUMN "customer_name" TEXT;
ALTER TABLE "complaints" ADD COLUMN "customer_mobile" TEXT;
ALTER TABLE "complaints" ADD COLUMN "customer_address" TEXT;
