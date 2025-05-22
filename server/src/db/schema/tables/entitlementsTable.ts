import {
  pgTable,
  numeric,
  boolean,
  foreignKey,
  unique,
  text,
} from "drizzle-orm/pg-core";
import { products, features } from "../index.js";

export const entitlements = pgTable(
  "entitlements",
  {
    created_at: numeric("created_at").notNull(),
    internal_feature_id: text("internal_feature_id"),
    org_id: text("org_id"),
    internal_product_id: text("internal_product_id"),
    allowance_type: text("allowance_type"),
    allowance: numeric(),
    interval: text(),
    id: text().primaryKey().notNull(),
    feature_id: text("feature_id"),
    is_custom: boolean("is_custom").default(false),
    carry_from_previous: boolean("carry_from_previous").default(false),
    entity_feature_id: text("entity_feature_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.internal_feature_id],
      foreignColumns: [features.internal_id],
      name: "entitlements_internal_feature_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.internal_product_id],
      foreignColumns: [products.internal_id],
      name: "entitlements_internal_product_id_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    unique("entitlements_id_key").on(table.id),
  ],
);
