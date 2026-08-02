import { queue } from "@trigger.dev/sdk/v3";

/** Delivery gets its OWN queue: it outlives the migration's DB work and must
 * never contend with the chunk lanes for fleet capacity.
 *
 * Trigger.dev copies the queue per `concurrencyKey` value, each copy getting
 * the full limit — so keying by migrationRunId with a limit of 1 means one
 * batch in flight per run (deliveries in flight = the run's
 * webhook_concurrency, nothing more), while separate runs never queue behind
 * each other. */
export const MIGRATION_WEBHOOK_DELIVERY_QUEUE_NAME =
	"migration-webhook-delivery";
export const MIGRATION_WEBHOOK_DELIVERY_QUEUE_CONCURRENCY = 1;
export const MIGRATION_WEBHOOK_DELIVERY_MAX_DURATION_SECONDS = 15 * 60;
/** Deliveries are at-least-once by design; a retry re-sends the batch. */
export const MIGRATION_WEBHOOK_DELIVERY_RETRY = { maxAttempts: 1 } as const;

/** Records per queue message — keeps payloads small while still batching. */
export const MIGRATION_WEBHOOK_RECORDS_PER_MESSAGE = 500;

export const migrationWebhookDeliveryQueue = queue({
	name: MIGRATION_WEBHOOK_DELIVERY_QUEUE_NAME,
	concurrencyLimit: MIGRATION_WEBHOOK_DELIVERY_QUEUE_CONCURRENCY,
});
