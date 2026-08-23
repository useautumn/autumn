import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The per-subject journal sequence; not a Postgres mirror, so hand-written.
export const subjectVersions = sqliteTable("subject_versions", {
	internal_customer_id: text("internal_customer_id").primaryKey().notNull(),
	version: integer("version").notNull(),
});
