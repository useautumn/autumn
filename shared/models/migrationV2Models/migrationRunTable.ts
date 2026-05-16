import { sql } from "drizzle-orm";
import {
	boolean,
	foreignKey,
	numeric,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "../orgModels/orgTable.js";
import { migrations } from "./migrationTable.js";

export const MigrationRunStatus = {
	Queued: "queued",
	Running: "running",
	Succeeded: "succeeded",
	Failed: "failed",
	Canceled: "canceled",
} as const;

export type MigrationRunStatus =
	(typeof MigrationRunStatus)[keyof typeof MigrationRunStatus];

export const ACTIVE_MIGRATION_RUN_STATUSES = [
	MigrationRunStatus.Queued,
	MigrationRunStatus.Running,
] as const;

export const migrationRuns = pgTable(
	"migration_runs",
	{
		internal_id: text().primaryKey().notNull(),
		migration_internal_id: text().notNull(),
		org_id: text().notNull(),
		env: text().notNull(),
		status: text().$type<MigrationRunStatus>().notNull(),
		dry_run: boolean().notNull(),
		lazy_run: boolean().notNull().default(false),
		trigger_run_id: text(),
		error_message: text(),
		/** When set, the run only processes items with these IDs (the `only`
		 *  param on /migrations.run). Item kind matches the operation scope
		 *  — typically customer IDs for customer ops, plan IDs for plan
		 *  ops, etc. Null = unscoped run-all. */
		only_ids: text("only_ids").array(),
		created_at: numeric({ mode: "number" }).notNull(),
		updated_at: numeric({ mode: "number" }),
		started_at: numeric({ mode: "number" }),
		finished_at: numeric({ mode: "number" }),
	},
	(table) => [
		foreignKey({
			columns: [table.migration_internal_id],
			foreignColumns: [migrations.internal_id],
			name: "migration_runs_migration_internal_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "migration_runs_org_id_fkey",
		}).onDelete("cascade"),
		// One queued/running run per migration definition. Different migrations
		// can be active concurrently — correctness lives at the per-customer
		// `migration_item_runs_live_unique` claim.
		uniqueIndex("migration_runs_active_per_migration_unique")
			.on(table.migration_internal_id)
			.where(sql`${table.status} IN ('queued', 'running')`),
	],
);

export type MigrationRun = typeof migrationRuns.$inferSelect;
export type MigrationRunInsert = typeof migrationRuns.$inferInsert;
