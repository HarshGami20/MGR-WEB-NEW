import { pgTable, text, serial, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull().default("Furniture Co."),
  gstNumber: text("gst_number"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  defaultGstPercent: numeric("default_gst_percent", { precision: 5, scale: 2 }).notNull().default("18"),
  invoicePrefix: text("invoice_prefix").notNull().default("INV"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
