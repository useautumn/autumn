import { WebhookEventType } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { sendBatchBillingUpdatedWebhooks } from "./sendBatchBillingUpdatedWebhooks/sendBatchBillingUpdatedWebhooks.js";
import { sendBatchProductsUpdatedWebhooks } from "./sendBatchProductsUpdatedWebhooks/sendBatchProductsUpdatedWebhooks.js";
import type { SendMigrationWebhooksPayload } from "./types/migrationWebhookRecord.js";

type DeliveryCounts = { delivered: number; failed: number };

const NOT_SUBSCRIBED: DeliveryCounts = { delivered: 0, failed: 0 };

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
