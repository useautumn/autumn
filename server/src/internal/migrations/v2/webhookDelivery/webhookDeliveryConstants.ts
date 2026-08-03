/** Deliveries in flight to the org's endpoint while a run drains. */
export const DEFAULT_MIGRATION_WEBHOOK_CONCURRENCY = 100;
export const MAX_MIGRATION_WEBHOOK_CONCURRENCY = 250;

/** Above this matched-customer count, webhooks default OFF: an operator has
 * to opt a bulk run in rather than discover it after the fact. */
export const MIGRATION_WEBHOOK_AUTO_DISABLE_THRESHOLD = 100_000;

export const resolveMigrationWebhookDelivery = ({
	sendWebhooks,
	webhookConcurrency,
	matchedCustomerCount,
}: {
	/** Run param; null/undefined means "decide from the count". */
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
