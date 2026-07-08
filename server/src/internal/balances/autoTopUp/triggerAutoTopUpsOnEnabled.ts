import type { AutoTopup, Customer } from "@autumn/shared";
import { RedisUnavailableError } from "@/external/redis/utils/errors";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { enqueueAutoTopupWithBurstSuppression } from "./helpers/enqueueAutoTopupWithBurstSuppression";
import { sendAutoTopupFailedWebhook } from "./webhooks/sendAutoTopupFailedWebhook";

/** Triggers an auto top-up for the first feature that transitions to enabled. */
export const triggerAutoTopUpsOnEnabled = async ({
	ctx,
	oldCustomer,
	newAutoTopups,
	customerId,
}: {
	ctx: AutumnContext;
	oldCustomer: Customer;
	newAutoTopups: AutoTopup[];
	customerId: string;
}) => {
	for (const autoTopup of newAutoTopups) {
		if (!autoTopup.enabled) continue;

		const originalAutoTopup = oldCustomer.auto_topups?.find(
			(at) => at.feature_id === autoTopup.feature_id,
		);

		if (originalAutoTopup?.enabled) continue;

		const feature = ctx.features.find((f) => f.id === autoTopup.feature_id);
		if (!feature) {
			ctx.logger.error(`[triggerAutoTopUpsOnEnabled] Feature not found`, {
				featureId: autoTopup.feature_id,
			});
			continue;
		}

		let enqueueResult: Awaited<
			ReturnType<typeof enqueueAutoTopupWithBurstSuppression>
		>;
		try {
			enqueueResult = await enqueueAutoTopupWithBurstSuppression({
				ctx,
				customerId,
				featureId: feature.id,
			});
		} catch (error) {
			if (!(error instanceof RedisUnavailableError)) throw error;
			enqueueResult = {
				enqueued: false as const,
				reason: "redis_unavailable" as const,
			};
		}

		if (enqueueResult?.reason === "redis_unavailable") {
			await sendAutoTopupFailedWebhook({
				ctx,
				customerId,
				featureId: feature.id,
				reason: "redis_unavailable",
				message: `Redis unavailable, skipping auto top-up enqueue for customer ${customerId} and feature ${feature.id}`,
				autoTopupConfig: autoTopup,
				suppressionKey: `auto_topup_failed_webhook:${ctx.org.id}:${ctx.env}:${customerId}:${feature.id}:redis_unavailable:${Math.floor(Date.now() / 3_600_000)}`,
				suppressionTtlMs: 3_600_000,
			});
		}

		break;
	}
};
