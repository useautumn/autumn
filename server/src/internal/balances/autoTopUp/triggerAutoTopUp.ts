import {
	type Feature,
	type FullCustomer,
	getRelevantFeatures,
} from "@autumn/shared";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { enqueueAutoTopupWithBurstSuppression } from "./helpers/enqueueAutoTopupWithBurstSuppression.js";
import { fullCustomerToAutoTopupObjects } from "./helpers/fullCustomerToAutoTopupObjects.js";
import { sendAutoTopupFailedWebhook } from "./webhooks/sendAutoTopupFailedWebhook.js";

/** Lightweight pre-check + SQS enqueue for auto top-ups after a deduction. */
export const triggerAutoTopUp = async ({
	ctx,
	newFullCus,
	feature,
}: {
	ctx: AutumnContext;
	newFullCus: FullCustomer;
	feature: Feature;
}) => {
	const relevantFeatures = getRelevantFeatures({
		features: ctx.features,
		featureId: feature.id,
	});

	for (const relevantFeature of relevantFeatures) {
		const resolved = fullCustomerToAutoTopupObjects({
			fullCustomer: newFullCus,
			featureId: relevantFeature.id,
		});

		if (!resolved?.balanceBelowThreshold) continue;

		// Enqueue the auto top-up job
		const customerId = newFullCus.id || newFullCus.internal_id;

		let enqueueResult: Awaited<
			ReturnType<typeof enqueueAutoTopupWithBurstSuppression>
		>;
		try {
			enqueueResult = await enqueueAutoTopupWithBurstSuppression({
				ctx,
				customerId,
				featureId: relevantFeature.id,
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
				featureId: relevantFeature.id,
				reason: "redis_unavailable",
				message: `Redis unavailable, skipping auto top-up enqueue for customer ${customerId} and feature ${relevantFeature.id}`,
				fullCustomer: newFullCus,
				autoTopupConfig: resolved.autoTopupConfig,
				suppressionKey: `auto_topup_failed_webhook:${ctx.org.id}:${ctx.env}:${customerId}:${relevantFeature.id}:redis_unavailable:${Math.floor(Date.now() / 3_600_000)}`,
				suppressionTtlMs: 3_600_000,
			});
		}
	}
};
