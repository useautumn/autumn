import { sqliteTable, text } from "drizzle-orm/sqlite-core";

// Command results replayed on retry; not a Postgres mirror, so hand-written.
export const serials = sqliteTable("serials", {
	command_id: text("command_id").primaryKey().notNull(),
	result: text("result").notNull(),
});
