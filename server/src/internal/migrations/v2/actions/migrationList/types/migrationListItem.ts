import type {
	Migration,
	MigrationListSummary,
	MigrationStatus,
} from "@autumn/shared";

export type MigrationListItem = Migration & {
	status: MigrationStatus;
	blocked_by: string | null;
	has_live_runs: boolean;
	summary: MigrationListSummary;
	batch_eligible: boolean;
};
