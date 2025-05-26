import {
  boolean,
  foreignKey,
  numeric,
  pgTable,
  unique,
} from "drizzle-orm/pg-core";
import { text } from "drizzle-orm/pg-core";
import { customers } from "../cusTable.js";
import { features } from "../../featureModels/featureTable.js";
import { organizations } from "../../orgModels/orgTable.js";

export const entities = pgTable(
  "entities",
  {
    id: text(),
    org_id: text("org_id"),
    created_at: numeric({ mode: "number" }).notNull(),
    internal_id: text("internal_id").primaryKey().notNull(),
    internal_customer_id: text("internal_customer_id").notNull(),
    env: text(),
    name: text(),
    deleted: boolean().default(false).notNull(),
    internal_feature_id: text("internal_feature_id"),

    // Optional...
    feature_id: text("feature_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.internal_customer_id],
      foreignColumns: [customers.internal_id],
      name: "entities_internal_customer_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.internal_feature_id],
      foreignColumns: [features.internal_id],
      name: "entities_internal_feature_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.org_id],
      foreignColumns: [organizations.id],
      name: "entities_org_id_fkey",
    }).onDelete("cascade"),

    unique("entity_id_constraint").on(
      table.org_id,
      table.env,
      table.internal_customer_id,
      table.id,
    ),
  ],
);
