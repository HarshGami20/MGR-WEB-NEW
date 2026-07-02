-- Per-photo comments on custom order line items
ALTER TABLE "order_items" ADD COLUMN "custom_image_comments" TEXT;
