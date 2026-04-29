import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const manufacturersTable = pgTable("manufacturers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  mobile: text("mobile"),
  email: text("email"),
  address: text("address"),
  specialization: text("specialization"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertManufacturerSchema = createInsertSchema(manufacturersTable).omit({ id: true, createdAt: true });
export type InsertManufacturer = z.infer<typeof insertManufacturerSchema>;
export type Manufacturer = typeof manufacturersTable.$inferSelect;
