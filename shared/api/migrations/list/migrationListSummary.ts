import type { MigrationRunStatus } from "../../../models/migrationV2Models/migrationRunTable.js";

export type MigrationListItemCounts = {
	total: number;
	running: number;
	succeeded: number;
	no_updates_needed: number;
	ineligible: number;
	failed: number;
};

export type MigrationListActivityKind =
	| "created"
	| "edited"
	| "queued"
	| "started"
	| "finished"
	| "failed"
	| "canceled"
	| "dry_run"
	| "sample";

/** Run-level facts one migration list row needs, summarized in batch per org. */
export type MigrationListSummary = {
	customer_count: number | null;
	/** The latest unscoped live Run All; its counts are migration-wide. */
	latest_run: {
		status: MigrationRunStatus;
		started_at: number | null;
		finished_at: number | null;
		error_message: string | null;
		counts: MigrationListItemCounts;
	} | null;
	latest_dry_run: {
		status: MigrationRunStatus;
		finished_at: number;
		previewed: number;
		would_change: number;
		would_fail: number;
	} | null;
	/** The latest finished scoped live run (a sample or picked customers). */
	latest_sample: {
		status: MigrationRunStatus;
		size: number;
		finished_at: number;
	} | null;
	queue_position: number | null;
	last_activity: { kind: MigrationListActivityKind; at: number };
};
