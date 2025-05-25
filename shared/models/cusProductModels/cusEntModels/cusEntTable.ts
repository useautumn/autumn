import {
  pgTable,
  numeric,
  boolean,
  foreignKey,
  unique,
  text,
  jsonb,
} from "drizzle-orm/pg-core";

import { features } from "../../featureModels/featureTable.js";

import { collatePgColumn } from "../../../db/utils.js";
import { EntityBalance } from "./cusEntModels.js";
import { customerProducts } from "../cusProductTable.js";

export const customerEntitlements = pgTable(
  "customer_entitlements",
  {
    id: text().primaryKey().notNull(),
    customer_product_id: text().notNull(),
    entitlement_id: text().notNull(),
    internal_customer_id: text().notNull(),
    internal_feature_id: text().notNull(),

    unlimited: boolean("unlimited").default(false),
    balance: numeric({ mode: "number" }).notNull().default(0),
    created_at: numeric({ mode: "number" }).notNull(),
    next_reset_at: numeric({ mode: "number" }),
    usage_allowed: boolean("usage_allowed").default(false),
    adjustment: numeric({ mode: "number" }),
    entities: jsonb("entities").$type<Record<string, EntityBalance>>(),

    // Optional...
    customer_id: text("customer_id"),
    feature_id: text("feature_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.internal_feature_id],
      foreignColumns: [features.internal_id],
      name: "entitlements_internal_feature_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.customer_product_id],
      foreignColumns: [customerProducts.id],
      name: "customer_entitlements_customer_product_id_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    unique("entitlements_id_key").on(table.id),
  ],
);

collatePgColumn(customerEntitlements.id, "C");
