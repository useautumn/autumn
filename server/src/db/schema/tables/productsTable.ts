import {
  boolean,
  foreignKey,
  jsonb,
  numeric,
  pgTable,
  text,
} from "drizzle-orm/pg-core";
import { organizations } from "../index.js";
import { sql } from "drizzle-orm";
import { sqlNow } from "../schemaUtils.js";

export const products = pgTable(
  "products",
  {
    internal_id: text("internal_id").primaryKey().notNull(),
    created_at: numeric("created_at").notNull().default(sqlNow),
    name: text(),
    org_id: text("org_id"),
    env: text(),
    is_add_on: boolean("is_add_on"),
    processor: jsonb(),
    is_default: boolean("is_default").default(false),
    id: text(),
    group: text().default(""),
    version: numeric().default("1"),
  },
  (table) => [
    foreignKey({
      columns: [table.org_id],
      foreignColumns: [organizations.id],
      name: "products_org_id_fkey",
    }).onDelete("cascade"),
  ],
);
