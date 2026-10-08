import { WebhookEventType } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { sendBatchBillingUpdatedWebhooks } from "./sendBatchBillingUpdatedWebhooks/sendBatchBillingUpdatedWebhooks.js";
import { sendBatchProductsUpdatedWebhooks } from "./sendBatchProductsUpdatedWebhooks/sendBatchProductsUpdatedWebhooks.js";
import type { SendMigrationWebhooksPayload } from "./types/migrationWebhookRecord.js";

type DeliveryCounts = { delivered: number; failed: number };

const NOT_SUBSCRIBED: DeliveryCounts = { delivered: 0, failed: 0 };

/**
 * Delivers one batch of migration webhooks, one subscribed event type at a
 * time, `concurrency` records in flight within each. Per-record failures are
 * logged and skipped: a run's audit trail lives in the item events, so one
 * bad endpoint response must not stall or fail the rest of the batch.
 */
export const sendMigrationWebhooks = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: SendMigrationWebhooksPayload;
}): Promise<{
	billingUpdated: DeliveryCounts;
	productsUpdated: DeliveryCounts;
}> => {
	const { migrationRunId, records, concurrency } = payload;
	const eventTypes = new Set(payload.eventTypes);

	const billingUpdated = eventTypes.has(WebhookEventType.BillingUpdated)
		? await sendBatchBillingUpdatedWebhooks({
				ctx,
				migrationRunId,
				records,
				concurrency,
			})
		: NOT_SUBSCRIBED;
	const productsUpdated = eventTypes.has(
		WebhookEventType.CustomerProductsUpdated,
	)
		? await sendBatchProductsUpdatedWebhooks({
				ctx,
				migrationRunId,
				records,
				concurrency,
			})
		: NOT_SUBSCRIBED;

	ctx.logger.info("migration-webhooks: batch delivered", {
		data: { migrationRunId, billingUpdated, productsUpdated, concurrency },
	});
	return { billingUpdated, productsUpdated };
};
