import {
	MigrationItemRunStatus,
	type MigrationItemRunStatus as MigrationItemRunStatusType,
} from "@autumn/shared";

export const RETRYABLE_MIGRATION_ITEM_RUN_STATUSES = [
	MigrationItemRunStatus.Failed,
	MigrationItemRunStatus.Skipped,
] as const;

export type RetryableMigrationItemRunStatus =
	(typeof RETRYABLE_MIGRATION_ITEM_RUN_STATUSES)[number];

export const normalizeRetryItemStatuses = ({
	retryItemStatuses,
}: {
	retryItemStatuses?: RetryableMigrationItemRunStatus[];
}): RetryableMigrationItemRunStatus[] => {
	const statuses = new Set(retryItemStatuses ?? []);
	return [...statuses];
};

export const isRetryableMigrationItemRunStatus = (
	status: MigrationItemRunStatusType,
): status is RetryableMigrationItemRunStatus =>
	status === MigrationItemRunStatus.Failed ||
	status === MigrationItemRunStatus.Skipped;
