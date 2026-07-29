import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	numeric,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const MigrationItemRunStatus = {
	Running: "running",
	Succeeded: "succeeded",
	Skipped: "skipped",
	Failed: "failed",
} as const;

export type MigrationItemRunStatus =
	(typeof MigrationItemRunStatus)[keyof typeof MigrationItemRunStatus];

export const MigrationItemKind = {
	Customer: "customer",
	Plan: "plan",
	Price: "price",
	Feature: "feature",
} as const;

export type MigrationItemKind =
	| (typeof MigrationItemKind)[keyof typeof MigrationItemKind]
	| (string & {});

export const migrationItemRuns = pgTable(
	"migration_item_runs",
	{
		migration_item_run_id: text().primaryKey().notNull(),
		migration_internal_id: text().notNull(),
		migration_run_id: text(),
		dry_run: boolean().notNull().default(false),
		item_kind: text().$type<MigrationItemKind>().notNull(),
		item_id: text().notNull(),
		status: text().$type<MigrationItemRunStatus>().notNull(),
		timestamp: timestamp({ withTimezone: true }).notNull().default(sql`now()`),
		created_at: numeric({ mode: "number" }).notNull(),
		updated_at: numeric({ mode: "number" }),
	},
	(table) => [
		uniqueIndex("migration_item_runs_live_unique")
			.on(table.migration_internal_id, table.item_kind, table.item_id)
			.where(sql`${table.dry_run} = false`),
		// item_id COLLATE "C" so the candidate-query anti-join (item_id = customers.internal_id, which is "C") index-seeks instead of seq-scanning
		index("migration_item_runs_live_c_idx")
			.on(
				table.migration_internal_id,
				table.item_kind,
				sql`${table.item_id} COLLATE "C"`,
			)
			.where(sql`${table.dry_run} = false`)
			.concurrently(),
		uniqueIndex("migration_item_runs_dry_run_unique")
			.on(
				table.migration_internal_id,
				table.migration_run_id,
				table.item_kind,
				table.item_id,
			)
			.where(sql`${table.dry_run} = true`),
		index("migration_item_runs_customer_recent_idx")
			.on(table.item_id, sql`${table.updated_at} DESC`)
			.where(sql`${table.item_kind} = 'customer'`),
	],
);

export type MigrationItemRun = typeof migrationItemRuns.$inferSelect;
export type MigrationItemRunInsert = typeof migrationItemRuns.$inferInsert;
