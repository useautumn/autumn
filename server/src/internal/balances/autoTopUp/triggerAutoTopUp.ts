import {
	type Feature,
	type FullCustomer,
	getRelevantFeatures,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { enqueueAutoTopupWithBurstSuppression } from "./helpers/enqueueAutoTopupWithBurstSuppression.js";
import { fullCustomerToAutoTopupObjects } from "./helpers/fullCustomerToAutoTopupObjects.js";

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

		console.log(
			`resolved, feature ${relevantFeature.id}, balance below threshold: ${resolved?.balanceBelowThreshold}, customerEntitlement balance: ${resolved?.customerEntitlement.balance}`,
		);

		if (!resolved?.balanceBelowThreshold) continue;

		// Enqueue the auto top-up job
		const customerId = newFullCus.id || newFullCus.internal_id;

		await enqueueAutoTopupWithBurstSuppression({
			ctx,
			customerId,
			featureId: relevantFeature.id,
		});
	}
};
