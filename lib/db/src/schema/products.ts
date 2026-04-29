import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { categoriesTable } from "./categories";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  categoryId: integer("category_id").references(() => categoriesTable.id),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  gstPercent: numeric("gst_percent", { precision: 5, scale: 2 }).notNull().default("18"),
  stockQty: integer("stock_qty").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(10),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
