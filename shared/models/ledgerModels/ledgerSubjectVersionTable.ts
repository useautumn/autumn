import { sql } from "drizzle-orm";
import { bigint, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// The projector's cursor per subject: the last journal version applied, and
// where that entry sat in the log. The gapless-version guard reads it.
export const ledgerSubjectVersions = pgTable("ledger_subject_versions", {
	internal_customer_id: text("internal_customer_id").primaryKey().notNull(),
	version: bigint("version", { mode: "number" }).notNull(),
	partition: integer("partition").notNull(),
	kafka_offset: bigint("kafka_offset", { mode: "number" }).notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.default(sql`now()`),
}).enableRLS();

export type DbLedgerSubjectVersion = typeof ledgerSubjectVersions.$inferSelect;
export type InsertDbLedgerSubjectVersion =
	typeof ledgerSubjectVersions.$inferInsert;
