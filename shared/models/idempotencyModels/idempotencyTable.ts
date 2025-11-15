import { jsonb, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils.js";

export const idempotency = pgTable("idempotency", {
	id: text().primaryKey().notNull(),
	created_at: numeric({ mode: "number" }).default(sqlNow),
	updated_at: numeric({ mode: "number" }).default(sqlNow),
	expires_at: numeric({ mode: "number" }),
	data: jsonb().default({}),
});

export type IdempotentOperation = typeof idempotency.$inferSelect;
export type InsertIdempotentOperation = typeof idempotency.$inferInsert;
