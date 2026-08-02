import type { RetryableMigrationItemRunStatus } from "@/hooks/queries/useMigrationsQuery";

type BuildRunMigrationRequestParams = {
	migrationId: string;
	dryRun: boolean;
	limit?: number;
	only?: string[];
	retryItemStatuses?: RetryableMigrationItemRunStatus[];
	/** Omitted → the server decides from the scope size. */
	sendWebhooks?: boolean;
	webhookConcurrency?: number;
};

type RunMigrationRequest = {
	id: string;
	dry_run: boolean;
	lazy_run: false;
	limit?: number;
	only?: string[];
	retry_item_statuses?: RetryableMigrationItemRunStatus[];
	send_webhooks?: boolean;
	webhook_concurrency?: number;
};

export const buildRunMigrationRequest = ({
	migrationId,
	dryRun,
	limit,
	only,
	retryItemStatuses,
	sendWebhooks,
	webhookConcurrency,
}: BuildRunMigrationRequestParams): RunMigrationRequest => {
	const request: RunMigrationRequest = {
		id: migrationId,
		dry_run: dryRun,
		lazy_run: false,
	};

	if (limit !== undefined) request.limit = limit;
	if (only !== undefined) request.only = only;
	if (sendWebhooks !== undefined) request.send_webhooks = sendWebhooks;
	if (webhookConcurrency !== undefined)
		request.webhook_concurrency = webhookConcurrency;

	if (retryItemStatuses && retryItemStatuses.length > 0) {
		request.retry_item_statuses = retryItemStatuses;
	} else if (only && only.length > 0) {
		request.retry_item_statuses = ["failed"];
	}

	return request;
};
