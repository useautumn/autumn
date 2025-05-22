import {
  boolean,
  foreignKey,
  unique,
  pgTable,
  numeric,
  jsonb,
  text,
} from "drizzle-orm/pg-core";
import { entitlements } from "./entitlementsTable.js";
import { products } from "./productsTable.js";

export const prices = pgTable(
  "prices",
  {
    created_at: numeric("created_at").notNull(),
    config: jsonb(),
    org_id: text("org_id"),
    internal_product_id: text("internal_product_id"),
    id: text().primaryKey().notNull(),
    name: text(),
    billing_type: text("billing_type"),
    is_custom: boolean("is_custom").default(false),
    entitlement_id: text("entitlement_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.entitlement_id],
      foreignColumns: [entitlements.id],
      name: "prices_entitlement_id_fkey",
    }),
    foreignKey({
      columns: [table.internal_product_id],
      foreignColumns: [products.internal_id],
      name: "prices_internal_product_id_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    unique("prices_id_key").on(table.id),
  ],
);
