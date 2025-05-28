import { pgTable, text, numeric, jsonb, foreignKey } from "drizzle-orm/pg-core";
import { products } from "../productModels/productTable.js";
import { organizations } from "../orgModels/orgTable.js";

export const migrationJobs = pgTable(
  "migration_jobs",
  {
    id: text().primaryKey().notNull(),
    org_id: text().notNull(),
    env: text().notNull(),

    created_at: numeric({ mode: "number" }).notNull(),
    updated_at: numeric({ mode: "number" }),
    current_step: text(),
    from_internal_product_id: text(),
    to_internal_product_id: text(),
    step_details: jsonb(),
  },
  (table) => [
    foreignKey({
      columns: [table.from_internal_product_id],
      foreignColumns: [products.internal_id],
      name: "migration_jobs_from_internal_product_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.org_id],
      foreignColumns: [organizations.id],
      name: "migration_jobs_org_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.to_internal_product_id],
      foreignColumns: [products.internal_id],
      name: "migration_jobs_to_internal_product_id_fkey",
    }).onDelete("cascade"),
  ],
);
