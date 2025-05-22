import {
  foreignKey,
  jsonb,
  numeric,
  pgTable,
  text,
  unique,
} from "drizzle-orm/pg-core";
import { organizations } from "../index.js";
import { relations } from "drizzle-orm";

export const features = pgTable(
  "features",
  {
    internal_id: text("internal_id").primaryKey().notNull(),
    org_id: text("org_id"),
    id: text().notNull(),
    name: text(),
    type: text(),
    created_at: numeric("created_at"),
    config: jsonb(),
    env: text().default("live"),
    display: jsonb(),
  },
  (table) => [
    foreignKey({
      columns: [table.org_id],
      foreignColumns: [organizations.id],
      name: "features_org_id_fkey",
    }).onDelete("cascade"),
    unique("feature_id_constraint").on(table.org_id, table.id, table.env),
  ],
);
