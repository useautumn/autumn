import type { AutoTopup, Customer } from "@autumn/shared";
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

		const enqueueResult = await enqueueAutoTopupWithBurstSuppression({
			ctx,
			customerId,
			featureId: feature.id,
		});

		if (enqueueResult?.reason === "redis_unavailable") {
			await sendAutoTopupFailedWebhook({
				ctx,
				customerId,
				featureId: feature.id,
				reason: "redis_unavailable",
				retryable: true,
				message: `Redis unavailable, skipping auto top-up enqueue for customer ${customerId} and feature ${feature.id}`,
				autoTopupConfig: autoTopup,
			});
		}

		break;
	}
};
