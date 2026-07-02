-- Optional discount (₹) recorded with a payment — reduces balance without cash received
ALTER TABLE "payments" ADD COLUMN "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
