import type { RetryableMigrationItemRunStatus } from "@/hooks/queries/useMigrationsQuery";

type BuildRunMigrationRequestParams = {
	migrationId: string;
	dryRun: boolean;
	limit?: number;
	only?: string[];
	concurrency?: number;
	retryItemStatuses?: RetryableMigrationItemRunStatus[];
};

type RunMigrationRequest = {
	id: string;
	dry_run: boolean;
	lazy_run: false;
	limit?: number;
	only?: string[];
	concurrency?: number;
	retry_item_statuses?: RetryableMigrationItemRunStatus[];
};

export const buildRunMigrationRequest = ({
	migrationId,
	dryRun,
	limit,
	only,
	concurrency,
	retryItemStatuses,
}: BuildRunMigrationRequestParams): RunMigrationRequest => {
	const request: RunMigrationRequest = {
		id: migrationId,
		dry_run: dryRun,
		lazy_run: false,
	};

	if (limit !== undefined) request.limit = limit;
	if (only !== undefined) request.only = only;
	if (concurrency !== undefined) request.concurrency = concurrency;

	if (retryItemStatuses && retryItemStatuses.length > 0) {
		request.retry_item_statuses = retryItemStatuses;
	} else if (only && only.length > 0) {
		request.retry_item_statuses = ["failed"];
	}

	return request;
};
