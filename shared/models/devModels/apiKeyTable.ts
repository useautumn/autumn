import {
  pgTable,
  text,
  numeric,
  jsonb,
  foreignKey,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "../orgModels/orgTable.js";
import { collatePgColumn, sqlNow } from "../../db/utils.js";

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text().primaryKey().notNull(),
    created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
    name: text(),
    prefix: text(),
    org_id: text("org_id"),
    user_id: text("user_id"),
    env: text(),
    hashed_key: text("hashed_key"),
    meta: jsonb(),
  },
  (table) => [
    foreignKey({
      columns: [table.org_id],
      foreignColumns: [organizations.id],
      name: "api_keys_org_id_fkey",
    }).onDelete("cascade"),
    unique("api_keys_hashed_key_key").on(table.hashed_key),
    unique("api_keys_org_env_name_key").on(table.org_id, table.env, table.name),
    // index("api_keys_hashed_key_key").on(table.hashed_key),
  ],
);

collatePgColumn(apiKeys.id, "C");
