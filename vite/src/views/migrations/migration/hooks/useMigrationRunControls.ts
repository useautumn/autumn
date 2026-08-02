import { useState } from "react";
import type { RetryableMigrationItemRunStatus } from "@/hooks/queries/useMigrationsQuery";

// Mirrors server/src/internal/migrations/v2/webhookDelivery — the run route
// clamps authoritatively; these drive the form's default and bounds.
export const DEFAULT_MIGRATION_WEBHOOK_CONCURRENCY = 100;
export const MAX_MIGRATION_WEBHOOK_CONCURRENCY = 250;
const MIGRATION_WEBHOOK_AUTO_DISABLE_THRESHOLD = 100_000;

export type MigrationRunControlsState = {
	retryErrored: boolean;
	retrySkipped: boolean;
	/** null → let the server decide from the scope size. */
	sendWebhooks: boolean | null;
	webhookConcurrency: number;
};

const INITIAL_STATE: MigrationRunControlsState = {
	retryErrored: false,
	retrySkipped: false,
	sendWebhooks: null,
	webhookConcurrency: DEFAULT_MIGRATION_WEBHOOK_CONCURRENCY,
};

const buildRetryItemStatuses = ({
	retryErrored,
	retrySkipped,
}: MigrationRunControlsState):
	| RetryableMigrationItemRunStatus[]
	| undefined => {
	const statuses: RetryableMigrationItemRunStatus[] = [];
	if (retryErrored) statuses.push("failed");
	if (retrySkipped) statuses.push("skipped");
	return statuses.length > 0 ? statuses : undefined;
};

/** Whether webhooks default on for this scope — mirrors the server's rule so
 * the toggle shows the same thing the run will do. */
export const webhooksDefaultOn = ({ count }: { count: number | null }) =>
	count === null || count <= MIGRATION_WEBHOOK_AUTO_DISABLE_THRESHOLD;

export const useMigrationRunControls = () => {
	const [value, setValue] = useState<MigrationRunControlsState>(INITIAL_STATE);

	return {
		value,
		setValue,
		runParams: {
			retryItemStatuses: buildRetryItemStatuses(value),
			sendWebhooks: value.sendWebhooks ?? undefined,
			webhookConcurrency: value.webhookConcurrency,
		},
	};
};
