import type {
	MigrationRunErrorCode,
	MigrationRunStatus,
} from "../../../models/migrationV2Models/migrationRunTable.js";

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

export type MigrationListSummary = {
	customer_count: number | null;
	latest_run: {
		status: MigrationRunStatus;
		started_at: number | null;
		finished_at: number | null;
		error_message: string | null;
		error_code: MigrationRunErrorCode | null;
		counts: MigrationListItemCounts;
	} | null;
	latest_dry_run: {
		status: MigrationRunStatus;
		finished_at: number;
		previewed: number;
		would_change: number;
		would_fail: number;
	} | null;
	latest_sample: {
		status: MigrationRunStatus;
		size: number;
		finished_at: number;
	} | null;
	queue_position: number | null;
	last_activity: { kind: MigrationListActivityKind; at: number };
};
