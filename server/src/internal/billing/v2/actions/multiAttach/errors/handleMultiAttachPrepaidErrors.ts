import {
	isPrepaidPrice,
	type MultiAttachProductContext,
	priceToEnt,
	RecaseError,
} from "@autumn/shared";

/**
 * Validates that no two plans in a multi-attach share the same prepaid feature.
 * Duplicate prepaid features across plans would cause conflicting quantity tracking.
 */
export const handleMultiAttachPrepaidErrors = ({
	productContexts,
}: {
	productContexts: MultiAttachProductContext[];
}) => {
	const seenFeatures = new Map<string, string>(); // featureId -> planId

	for (const productContext of productContexts) {
		const { fullProduct } = productContext;

		for (const price of fullProduct.prices) {
			if (!isPrepaidPrice(price)) continue;

			const entitlement = priceToEnt({
				price,
				entitlements: fullProduct.entitlements,
				errorOnNotFound: false,
			});

			if (!entitlement) continue;

			const featureId = entitlement.feature.id;
			const existingPlanId = seenFeatures.get(featureId);

			if (existingPlanId) {
				throw new RecaseError({
					message: `Feature "${featureId}" has prepaid pricing in both plan "${existingPlanId}" and plan "${fullProduct.id}". Multi-attach does not support the same prepaid feature across multiple plans.`,
					statusCode: 400,
				});
			}

			seenFeatures.set(featureId, fullProduct.id);
		}
	}
};
