import { pgTable, text, numeric, jsonb, unique } from "drizzle-orm/pg-core";
import { collatePgColumn } from "../schemaUtils.js";

export const customers = pgTable(
  "customers",
  {
    internal_id: text("internal_id").primaryKey().notNull(),
    name: text().default(""),
    org_id: text("org_id").notNull(),
    created_at: numeric("created_at").notNull(),
    id: text(),
    env: text(),
    processor: jsonb(),
    email: text().default(""),
    fingerprint: text(),
    metadata: jsonb().default({}),
  },
  (table) => [
    unique("cus_id_constraint").on(table.org_id, table.id, table.env),
  ],
).enableRLS();

collatePgColumn(customers.internal_id, "C");
