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
		trigger_run_id: text(),
		error_message: text(),
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
		// Allows historical runs while enforcing one queued/running migration per org/env.
		uniqueIndex("migration_runs_active_org_env_unique")
			.on(table.org_id, table.env)
			.where(sql`${table.status} IN ('queued', 'running')`),
	],
);

export type MigrationRun = typeof migrationRuns.$inferSelect;
export type MigrationRunInsert = typeof migrationRuns.$inferInsert;
