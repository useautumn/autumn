import {
  boolean,
  foreignKey,
  unique,
  pgTable,
  numeric,
  jsonb,
  text,
} from "drizzle-orm/pg-core";

import { entitlements } from "../entModels/entTable.js";
import { products } from "../productTable.js";
import { FixedPriceConfig } from "./priceConfig/fixedPriceConfig.js";
import { UsagePriceConfig } from "./priceConfig/usagePriceConfig.js";
import { sql } from "drizzle-orm";

export const prices = pgTable(
  "prices",
  {
    created_at: numeric({ mode: "number" }).notNull(),
    config: jsonb().$type<FixedPriceConfig | UsagePriceConfig>(),
    org_id: text("org_id").notNull(),
    internal_product_id: text("internal_product_id").notNull(),
    id: text().primaryKey().notNull(),
    name: text(),
    billing_type: text("billing_type"),
    is_custom: boolean("is_custom").default(false),
    entitlement_id: text("entitlement_id").default(sql`null`),
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
