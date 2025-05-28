import {
  pgTable,
  foreignKey,
  unique,
  text,
  numeric,
  boolean,
} from "drizzle-orm/pg-core";

export const invoiceItems = pgTable(
  "invoice_items",
  {
    createdAt: numeric("created_at").notNull(),
    updatedAt: numeric("updated_at"),
    customerPriceId: text("customer_price_id"),
    periodStart: numeric("period_start"),
    periodEnd: numeric("period_end"),
    prorationStart: numeric("proration_start"),
    prorationEnd: numeric("proration_end"),
    quantity: numeric(),
    amount: numeric(),
    currency: text(),
    id: text().primaryKey().notNull(),
    addedToStripe: boolean("added_to_stripe").default(false),
    customerId: text("customer_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.customerPriceId],
      foreignColumns: [customerPrices.id],
      name: "invoice_items_customer_price_id_fkey",
    }).onDelete("cascade"),
    unique("invoice_items_id_key").on(table.id),
  ],
);
