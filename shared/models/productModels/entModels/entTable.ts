import {
  pgTable,
  numeric,
  boolean,
  foreignKey,
  unique,
  text,
} from "drizzle-orm/pg-core";

import { features } from "../../featureModels/featureTable.js";
import { products } from "../productTable.js";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { collatePgColumn } from "../../../db/utils.js";

export const entitlements = pgTable(
  "entitlements",
  {
    id: text().primaryKey().notNull(),
    created_at: numeric({ mode: "number" }).notNull(),
    internal_feature_id: text().notNull(),
    internal_product_id: text().notNull(),
    is_custom: boolean().default(false),

    allowance_type: text(),
    allowance: numeric({ mode: "number" }),
    interval: text(),

    carry_from_previous: boolean("carry_from_previous").default(false),
    entity_feature_id: text("entity_feature_id").default(sql`null`),

    // Optional fields
    org_id: text("org_id"),
    feature_id: text("feature_id"),
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

export const EntInsertSchema = createInsertSchema(entitlements);

collatePgColumn(entitlements.id, "C");
