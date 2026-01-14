import {
	cusProductToPrices,
	ErrCode,
	isPrepaidPrice,
	RecaseError,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/autumnBillingPlan";

export const handleFeatureQuantityErrors = ({
	// biome-ignore lint/correctness/noUnusedFunctionParameters: consistent signature with other error handlers
	billingContext,
	autumnBillingPlan,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const newCustomerProduct = autumnBillingPlan.insertCustomerProducts?.[0];
	if (!newCustomerProduct) return;

	const newPrices = cusProductToPrices({ cusProduct: newCustomerProduct });
	const prepaidPrices = newPrices.filter(isPrepaidPrice);

	if (prepaidPrices.length === 0) {
		return;
	}

	const options = newCustomerProduct.options || [];
	const missingFeatures: string[] = [];

	for (const price of prepaidPrices) {
		const config = price.config as UsagePriceConfig;
		const internalFeatureId = config.internal_feature_id;

		// Check if there's an option for this prepaid price
		const hasOption = options.some(
			(opt) => opt.internal_feature_id === internalFeatureId,
		);

		if (!hasOption) {
			// Try to find the feature_id from customer_entitlements
			const cusEnt = newCustomerProduct.customer_entitlements?.find(
				(ce) => ce.entitlement.internal_feature_id === internalFeatureId,
			);
			const featureId = cusEnt?.entitlement.feature_id || internalFeatureId;
			missingFeatures.push(featureId);
		}
	}

	if (missingFeatures.length > 0) {
		throw new RecaseError({
			message: `Missing quantity options for prepaid features: ${missingFeatures.join(", ")}`,
			code: ErrCode.InvalidOptions,
			statusCode: 400,
		});
	}
};
