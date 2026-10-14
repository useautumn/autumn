export const DEFAULT_MIGRATION_WEBHOOK_CONCURRENCY = 100;
export const MAX_MIGRATION_WEBHOOK_CONCURRENCY = 250;

export const MIGRATION_WEBHOOK_AUTO_DISABLE_THRESHOLD = 100_000;

export const resolveMigrationWebhookDelivery = ({
	sendWebhooks,
	webhookConcurrency,
	matchedCustomerCount,
}: {
	sendWebhooks?: boolean | null;
	webhookConcurrency?: number | null;
	matchedCustomerCount: number;
}): { sendWebhooks: boolean; webhookConcurrency: number } => ({
	sendWebhooks:
		sendWebhooks ??
		matchedCustomerCount <= MIGRATION_WEBHOOK_AUTO_DISABLE_THRESHOLD,
	webhookConcurrency: Math.min(
		Math.max(webhookConcurrency ?? DEFAULT_MIGRATION_WEBHOOK_CONCURRENCY, 1),
		MAX_MIGRATION_WEBHOOK_CONCURRENCY,
	),
});
