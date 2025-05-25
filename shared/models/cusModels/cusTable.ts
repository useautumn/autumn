import {
  pgTable,
  text,
  numeric,
  jsonb,
  unique,
  foreignKey,
} from "drizzle-orm/pg-core";
import { collatePgColumn } from "../../db/utils.js";
import { organizations } from "../orgModels/orgTable.js";
import { sql } from "drizzle-orm";

export type CustomerProcessor = {
  type: "stripe";
  id: string;
};

export const customers = pgTable(
  "customers",
  {
    internal_id: text("internal_id").primaryKey().notNull(),
    org_id: text("org_id").notNull(),
    created_at: numeric({ mode: "number" }).notNull(),
    name: text(),
    id: text(),
    email: text(),
    fingerprint: text().default(sql`null`),
    metadata: jsonb().$type<Record<string, unknown>>(),

    env: text().notNull(),
    processor: jsonb().$type<CustomerProcessor>(),
  },
  (table) => [
    unique("cus_id_constraint").on(table.org_id, table.id, table.env),
    foreignKey({
      columns: [table.org_id],
      foreignColumns: [organizations.id],
      name: "customers_org_id_fkey",
    }).onDelete("cascade"),
  ],
).enableRLS();

collatePgColumn(customers.internal_id, "C");
