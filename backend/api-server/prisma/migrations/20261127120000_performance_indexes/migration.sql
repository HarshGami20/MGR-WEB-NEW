-- CreateIndex
CREATE INDEX IF NOT EXISTS "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "inventory_logs_product_id_idx" ON "inventory_logs"("product_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "inventory_logs_created_at_idx" ON "inventory_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "orders_created_at_idx" ON "orders"("created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "orders_branch_id_created_at_idx" ON "orders"("branch_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "orders_assigned_to_id_idx" ON "orders"("assigned_to_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "orders_created_by_id_idx" ON "orders"("created_by_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "orders_category_id_idx" ON "orders"("category_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_order_id_idx" ON "invoices"("order_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_created_at_idx" ON "invoices"("created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_created_at_idx" ON "payments"("created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "purchase_orders_created_at_idx" ON "purchase_orders"("created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "purchase_orders_branch_id_idx" ON "purchase_orders"("branch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "purchase_orders_supplier_id_idx" ON "purchase_orders"("supplier_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "purchase_orders_manufacturer_id_idx" ON "purchase_orders"("manufacturer_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "purchase_order_items_purchase_order_id_idx" ON "purchase_order_items"("purchase_order_id");

