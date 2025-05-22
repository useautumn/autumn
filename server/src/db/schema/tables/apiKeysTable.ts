import {
  pgTable,
  text,
  numeric,
  jsonb,
  foreignKey,
  unique,
} from "drizzle-orm/pg-core";

import { organizations } from "../index.js";

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text().primaryKey().notNull(),
    created_at: numeric("created_at").notNull(),
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
  ],
);

export type ApiKey = typeof apiKeys.$inferSelect;
