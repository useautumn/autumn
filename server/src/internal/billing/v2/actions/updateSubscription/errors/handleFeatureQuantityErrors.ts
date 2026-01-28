import {
	cusProductToPrices,
	ErrCode,
	isPrepaidPrice,
	priceToFeature,
	RecaseError,
	type UpdateSubscriptionV0Params,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/types";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types";
import { billingPlanToNewActiveCustomerProduct } from "@/internal/billing/v2/utils/billingPlan/billingPlanToNewActiveCustomerProduct";

const checkInputFeatureQuantitiesAreValid = ({
	ctx,
	params,
	autumnBillingPlan,
	billingContext,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV0Params;
	autumnBillingPlan: AutumnBillingPlan;
	billingContext: UpdateSubscriptionBillingContext;
}) => {
	const targetCustomerProduct =
		billingPlanToNewActiveCustomerProduct({
			autumnBillingPlan,
		}) ?? billingContext.customerProduct;

	if (!targetCustomerProduct) return;

	const prepaidPrices = cusProductToPrices({
		cusProduct: targetCustomerProduct,
	}).filter(isPrepaidPrice);

	for (const option of params.options ?? []) {
		const targetPrepaidPrice = prepaidPrices.find((p) => {
			const priceFeature = priceToFeature({
				price: p,
				features: ctx.features,
				errorOnNotFound: false,
			});
			return priceFeature?.id === option.feature_id;
		});

		if (!targetPrepaidPrice) {
			throw new RecaseError({
				message: `Invalid feature quantity passed in (feature ID: ${option.feature_id}). This feature has no prepaid price on the updated product.`,
			});
		}
	}
};

export const handleFeatureQuantityErrors = ({
	ctx,
	billingContext,
	autumnBillingPlan,
	params,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	params: UpdateSubscriptionV0Params;
}) => {
	// 1. Check if param feature IDs are valid
	checkInputFeatureQuantitiesAreValid({
		ctx,
		autumnBillingPlan,
		billingContext,
		params,
	});

	const newCustomerProduct = autumnBillingPlan.insertCustomerProducts?.[0];
	if (!newCustomerProduct) return;

	const newPrices = cusProductToPrices({ cusProduct: newCustomerProduct });
	const prepaidPrices = newPrices.filter(isPrepaidPrice);

	if (prepaidPrices.length === 0) return;

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
