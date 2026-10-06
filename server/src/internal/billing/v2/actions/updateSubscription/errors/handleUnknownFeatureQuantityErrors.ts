import {
	ErrCode,
	findPrepaidQuantityTargetPrice,
	RecaseError,
	type UpdateSubscriptionBillingContext,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";

/** Rejects feature_quantities for features the plan has no prepaid price for; quantity setup would otherwise drop them silently. */
export const handleUnknownFeatureQuantityErrors = ({
	billingContext,
	params,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV1Params;
}) => {
	const [fullProduct] = billingContext.fullProducts;

	const unknownFeatureIds = (params.feature_quantities ?? [])
		.map((featureQuantity) => featureQuantity.feature_id)
		.filter(
			(featureId) =>
				!findPrepaidQuantityTargetPrice({
					prices: fullProduct.prices,
					featureId,
				}),
		);

	if (unknownFeatureIds.length === 0) return;

	throw new RecaseError({
		message: `feature_quantities can only set prepaid features of plan '${fullProduct.id}'; not prepaid on it: ${unknownFeatureIds.join(", ")}`,
		code: ErrCode.InvalidOptions,
		statusCode: 400,
	});
};
