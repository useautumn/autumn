import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { sendMigrationWebhooksTask } from "@/trigger/migrations/sendMigrationWebhooksTask/sendMigrationWebhooksTask.js";
import type { MigrationWebhookControls } from "../../cloudAdapter/types.js";
import { sendMigrationWebhooks } from "../sendMigrationWebhooks.js";
import type { MigrationWebhookRecord } from "../types/migrationWebhookRecord.js";
import { MIGRATION_WEBHOOK_RECORDS_PER_MESSAGE } from "./migrationWebhookDeliveryQueue.js";

/**
 * The single entry point both migration lanes use to deliver webhooks.
 * Batches leave the run's lifetime: the task drains them on its own queue,
 * keyed by run so one migration never starves another.
 */
/** Splits a page's records into queue-message-sized batches. */
export const chunkWebhookRecords = ({
	records,
	size = MIGRATION_WEBHOOK_RECORDS_PER_MESSAGE,
}: {
	records: MigrationWebhookRecord[];
	size?: number;
}): MigrationWebhookRecord[][] => {
	const batches: MigrationWebhookRecord[][] = [];
	for (let offset = 0; offset < records.length; offset += size) {
		batches.push(records.slice(offset, offset + size));
	}
	return batches;
};

export const queueMigrationWebhooks = async ({
	ctx,
	migrationRunId,
	controls,
	records,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
	controls: MigrationWebhookControls | undefined;
	records: MigrationWebhookRecord[];
}): Promise<number> => {
	if (!controls?.sendWebhooks || records.length === 0) return 0;

	const batches = chunkWebhookRecords({ records });

	for (const [index, batch] of batches.entries()) {
		const payload = {
			orgId: ctx.org.id,
			env: ctx.env,
			migrationRunId,
			concurrency: controls.webhookConcurrency,
			eventTypes: controls.eventTypes,
			records: batch,
		};

		// No trigger.dev configured (local/tests): deliver inline so behaviour
		// stays observable instead of silently dropping.
		if (!process.env.TRIGGER_SECRET_KEY) {
			await sendMigrationWebhooks({ ctx, payload });
			continue;
		}

		await sendMigrationWebhooksTask.trigger(payload, {
			concurrencyKey: migrationRunId,
			idempotencyKey: `migration-webhooks:${migrationRunId}:${records[0]?.customerId}:${index}`,
			idempotencyKeyTTL: "7d",
		});
	}

	return batches.length;
};
