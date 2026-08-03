import { task } from "@trigger.dev/sdk/v3";
import { warmupRegionalRedis } from "@/external/redis/initUtils/redisWarmup.js";
import { sendMigrationWebhooks } from "@/internal/migrations/v2/webhookDelivery/sendMigrationWebhooks.js";
import { SendMigrationWebhooksPayloadSchema } from "@/internal/migrations/v2/webhookDelivery/types/migrationWebhookRecord.js";
import {
	MIGRATION_WEBHOOK_DELIVERY_MAX_DURATION_SECONDS,
	MIGRATION_WEBHOOK_DELIVERY_RETRY,
	migrationWebhookDeliveryQueue,
} from "@/internal/migrations/v2/webhookDelivery/utils/migrationWebhookDeliveryQueue.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";

export const sendMigrationWebhooksTask = task({
	id: "send-migration-webhooks",
	queue: migrationWebhookDeliveryQueue,
	retry: MIGRATION_WEBHOOK_DELIVERY_RETRY,
	machine: "small-1x",
	maxDuration: MIGRATION_WEBHOOK_DELIVERY_MAX_DURATION_SECONDS,
	run: async (rawPayload: unknown, { ctx: triggerCtx }) => {
		const payload = SendMigrationWebhooksPayloadSchema.parse(rawPayload);
		const { ctx, logger } = await createTriggerContext({
			orgId: payload.orgId,
			env: payload.env,
			triggerCtx,
		});

		await warmupRegionalRedis().catch((error) => {
			logger.warn("send-migration-webhooks: redis warmup failed (continuing)", {
				data: {
					error: error instanceof Error ? error.message : String(error),
				},
			});
		});

		return sendMigrationWebhooks({ ctx, payload });
	},
});
