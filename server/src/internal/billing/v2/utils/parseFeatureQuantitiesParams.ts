import {
	cusProductToConvertedFeatureOptions,
	type FeatureOptions,
	type FullCusProduct,
	type FullProduct,
	isPrepaidPrice,
	priceToFeature,
	type UpdateSubscriptionV0Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { paramsToFeatureOptions } from "@/internal/billing/v2/compute/computeAutumnUtils/paramsToFeatureOptions";

/**
 * Parses feature quantities from params, iterating over all prepaid prices.
 * For each prepaid price, uses new quantity from params or falls back to existing subscription.
 */
export const parseFeatureQuantitiesParams = ({
	ctx,
	featureQuantitiesParams,
	fullProduct,
	currentCustomerProduct,
}: {
	ctx: AutumnContext;
	featureQuantitiesParams: UpdateSubscriptionV0Params;
	fullProduct: FullProduct;
	currentCustomerProduct?: FullCusProduct;
}): FeatureOptions[] => {
	const options: FeatureOptions[] = [];

	for (const price of fullProduct.prices) {
		if (!isPrepaidPrice(price)) continue;

		const feature = priceToFeature({
			price,
			features: ctx.features,
			errorOnNotFound: true,
		});

		// Get new feature quantity from params
		const newFeatureQuantity = paramsToFeatureOptions({
			params: featureQuantitiesParams,
			price,
			feature,
		});

		// Get current feature quantity from existing subscription
		const currentFeatureQuantity = currentCustomerProduct
			? cusProductToConvertedFeatureOptions({
					cusProduct: currentCustomerProduct,
					feature,
					newPrice: price,
				})
			: undefined;

		// Prefer new quantity, fall back to current
		const featureQuantity = newFeatureQuantity ?? currentFeatureQuantity;

		if (featureQuantity) {
			options.push(featureQuantity);
		}
	}

	return options;
};
