import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

export const inventoryLogsTable = pgTable("inventory_logs", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  type: text("type").notNull(), // in | out | adjustment
  quantity: integer("quantity").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInventoryLogSchema = createInsertSchema(inventoryLogsTable).omit({ id: true, createdAt: true });
export type InsertInventoryLog = z.infer<typeof insertInventoryLogSchema>;
export type InventoryLog = typeof inventoryLogsTable.$inferSelect;
