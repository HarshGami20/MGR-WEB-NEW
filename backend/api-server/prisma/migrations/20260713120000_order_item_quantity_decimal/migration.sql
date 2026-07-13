-- Allow fractional quantities on custom order line items (e.g. 2.5 metres).
ALTER TABLE "order_items" ALTER COLUMN "quantity" TYPE DECIMAL(10,3) USING "quantity"::decimal;
