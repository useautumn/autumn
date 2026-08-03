import { customerToSvixTags, WebhookEventType } from "@autumn/shared";
import type { BillingChangeResponse } from "@autumn/shared/api/billing/common/billingChangeResponse.js";
import pLimit from "p-limit";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MigrationWebhookRecord } from "../types/migrationWebhookRecord.js";

const sendBillingUpdated = async ({
	ctx,
	record,
}: {
	ctx: AutumnContext;
	record: MigrationWebhookRecord;
}) => {
	if (record.planChanges.length === 0) return;

	await sendSvixEvent({
		ctx,
		eventType: WebhookEventType.BillingUpdated,
		data: {
			object: "billing.updated",
			customer_id: record.customerId,
			...(record.entityId ? { entity_id: record.entityId } : {}),
			plan_changes: record.planChanges,
			tags: [],
		} satisfies BillingChangeResponse,
		tags: customerToSvixTags({
			customerId: record.customerId,
			entityId: record.entityId,
		}),
	});
};

/**
 * The `billing.updated` leg for one batch of records: the payload rides the
 * record (no reads), so this is pure Svix fan-out `concurrency` at a time.
 * Per-record failures are logged and skipped — the run's audit trail lives in
 * the item events.
 */
export const sendBatchBillingUpdatedWebhooks = async ({
	ctx,
	migrationRunId,
	records,
	concurrency,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
	records: MigrationWebhookRecord[];
	concurrency: number;
}): Promise<{ delivered: number; failed: number }> => {
	let delivered = 0;
	let failed = 0;
	const limit = pLimit(concurrency);
	await Promise.all(
		records.map((record) =>
			limit(async () => {
				try {
					await sendBillingUpdated({ ctx, record });
					delivered++;
				} catch (error) {
					failed++;
					ctx.logger.error(
						"migration-webhooks: billing.updated delivery failed",
						{
							data: {
								migrationRunId,
								customerId: record.customerId,
								error: error instanceof Error ? error.message : String(error),
							},
						},
					);
				}
			}),
		),
	);
	return { delivered, failed };
};
