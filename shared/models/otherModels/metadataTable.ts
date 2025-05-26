import { pgTable, text, numeric, jsonb } from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils.js";

export const metadata = pgTable("metadata", {
  id: text().primaryKey().notNull(),
  created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
  expires_at: numeric({ mode: "number" }),
  data: jsonb(),
});
