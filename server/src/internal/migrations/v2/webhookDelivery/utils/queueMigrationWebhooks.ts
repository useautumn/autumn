import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isTriggerConfigured } from "@/trigger/configureTrigger.js";
import { sendMigrationWebhooksTask } from "@/trigger/migrations/sendMigrationWebhooksTask/sendMigrationWebhooksTask.js";
import type { MigrationWebhookControls } from "../../cloudAdapter/types.js";
import { sendMigrationWebhooks } from "../sendMigrationWebhooks.js";
import type { MigrationWebhookRecord } from "../types/migrationWebhookRecord.js";
import { MIGRATION_WEBHOOK_RECORDS_PER_MESSAGE } from "./migrationWebhookDeliveryQueue.js";

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

	const submissions = batches.map((batch, index) => ({
		payload: {
			orgId: ctx.org.id,
			env: ctx.env,
			migrationRunId,
			concurrency: controls.webhookConcurrency,
			eventTypes: controls.eventTypes,
			records: batch,
		},
		options: {
			concurrencyKey: migrationRunId,
			idempotencyKey: `migration-webhooks:${migrationRunId}:${records[0]?.customerId}:${index}`,
			idempotencyKeyTTL: "7d",
		},
	}));

	if (isTriggerConfigured()) {
		// Submit the page together so queue latency isn't paid once per delivery task.
		await sendMigrationWebhooksTask.batchTrigger(submissions);
	} else {
		for (const { payload } of submissions) {
			await sendMigrationWebhooks({ ctx, payload });
		}
	}

	return batches.length;
};
