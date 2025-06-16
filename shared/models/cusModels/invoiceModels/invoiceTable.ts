import { foreignKey, jsonb, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { collatePgColumn, sqlNow } from "../../../db/utils.js";
import { InvoiceDiscount, InvoiceItem } from "./invoiceModels.js";
import { customers } from "../cusTable.js";
import { entities } from "../entityModels/entityTable.js";

export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
    product_ids: text("product_ids").array().default([]),
    internal_product_ids: text("internal_product_ids").array().default([]),

    internal_customer_id: text("internal_customer_id").notNull(),
    internal_entity_id: text("internal_entity_id"),

    stripe_id: text("stripe_id").notNull(),
    status: text("status").notNull().default("draft"),
    hosted_invoice_url: text("hosted_invoice_url"),
    total: numeric({ mode: "number" }).notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    discounts: jsonb("discounts").$type<InvoiceDiscount>().array().default([]),
    items: jsonb("items").$type<InvoiceItem>().array().default([]),
  },
  (table) => [
    foreignKey({
      columns: [table.internal_customer_id],
      foreignColumns: [customers.internal_id],
      name: "invoices_internal_customer_id_fkey",
    }),
    foreignKey({
      columns: [table.internal_entity_id],
      foreignColumns: [entities.internal_id],
      name: "invoices_internal_entity_id_fkey",
    }),
  ],
);

collatePgColumn(invoices.id, "C");
