import { sql } from "drizzle-orm";
import {
	foreignKey,
	index,
	numeric,
	pgTable,
	primaryKey,
	text,
} from "drizzle-orm/pg-core";
import { migrations } from "./migrationTable.js";

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
		migration_internal_id: text().notNull(),
		item_kind: text().$type<MigrationItemKind>().notNull(),
		item_id: text().notNull(),
		status: text().$type<MigrationItemRunStatus>().notNull(),
		created_at: numeric({ mode: "number" }).notNull(),
		updated_at: numeric({ mode: "number" }),
	},
	(table) => [
		foreignKey({
			columns: [table.migration_internal_id],
			foreignColumns: [migrations.internal_id],
			name: "migration_item_runs_migration_internal_id_fkey",
		}).onDelete("cascade"),
		primaryKey({
			columns: [table.migration_internal_id, table.item_kind, table.item_id],
			name: "migration_item_runs_pkey",
		}),
		index("migration_item_runs_customer_recent_idx")
			.on(table.item_id, sql`${table.updated_at} DESC`)
			.where(sql`${table.item_kind} = 'customer'`),
	],
);

export type MigrationItemRun = typeof migrationItemRuns.$inferSelect;
export type MigrationItemRunInsert = typeof migrationItemRuns.$inferInsert;
