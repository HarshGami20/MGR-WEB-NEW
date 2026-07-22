-- Per-photo comments on custom purchase order line items
ALTER TABLE "purchase_order_items" ADD COLUMN "custom_image_comments" TEXT;
