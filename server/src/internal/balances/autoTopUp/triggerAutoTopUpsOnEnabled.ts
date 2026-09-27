import type { AutoTopup, Customer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { dispatchAutoTopup } from "./helpers/dispatchAutoTopup.js";
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

		const dispatched = await dispatchAutoTopup({
			ctx,
			customerId,
			featureId: feature.id,
		});

		if (dispatched.reason === "redis_unavailable") {
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
