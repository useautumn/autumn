import {
	type BillingContextOverride,
	type BillingParamsBaseV1,
	cusProductToConvertedFeatureOptions,
	type FeatureOptions,
	type FullCusProduct,
	type FullProduct,
	isPrepaidPrice,
	priceToEnt,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { paramsToFeatureOptions } from "@/internal/billing/v2/compute/computeAutumnUtils/paramsToFeatureOptions";

/**
 * Sets up feature quantities context from params, iterating over all prepaid prices.
 * For each prepaid price, uses new quantity from params or falls back to existing subscription.
 */
export const setupFeatureQuantitiesContext = ({
	// biome-ignore lint/correctness/noUnusedFunctionParameters: Might be used in the future
	ctx,
	featureQuantitiesParams,
	fullProduct,
	currentCustomerProduct,
	initializeUndefinedQuantities = false,
	contextOverride = {},
}: {
	ctx: AutumnContext;
	featureQuantitiesParams: BillingParamsBaseV1;
	fullProduct: FullProduct;
	currentCustomerProduct?: FullCusProduct;
	initializeUndefinedQuantities?: boolean;
	contextOverride?: BillingContextOverride;
}): FeatureOptions[] => {
	if (contextOverride.featureQuantities) {
		return contextOverride.featureQuantities;
	}

	const options: FeatureOptions[] = [];

	for (const price of fullProduct.prices) {
		if (!isPrepaidPrice(price)) continue;

		// const feature = priceToFeature({
		// 	price,
		// 	features: ctx.features,
		// 	errorOnNotFound: true,
		// });

		const entitlement = priceToEnt({
			price,
			entitlements: fullProduct.entitlements,
			errorOnNotFound: true,
		});

		// Get new feature quantity from params
		const newFeatureQuantity = paramsToFeatureOptions({
			params: featureQuantitiesParams,
			price,
			entitlement,
		});

		// Get current feature quantity from existing subscription
		const currentFeatureQuantity = currentCustomerProduct
			? cusProductToConvertedFeatureOptions({
					cusProduct: currentCustomerProduct,
					entitlement,
					newPrice: price,
				})
			: undefined;

		// Prefer new quantity, fall back to current
		const featureQuantity = newFeatureQuantity ?? currentFeatureQuantity;

		if (featureQuantity) {
			options.push(featureQuantity);
			continue;
		}

		if (initializeUndefinedQuantities) {
			options.push({
				feature_id: entitlement.feature.id,
				internal_feature_id: entitlement.feature.internal_id,
				quantity: 0,
			});
		}
	}

	return options;
};
