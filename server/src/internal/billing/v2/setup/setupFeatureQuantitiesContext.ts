import {
	type BillingContextOverride,
	cusProductToConvertedFeatureOptions,
	type FeatureOptions,
	type FeatureQuantityParamsV0,
	type FullCusProduct,
	type FullProduct,
	isLosingPrepaidQuantityPrice,
	isOneOffPrice,
	isPrepaidPrice,
	priceToEnt,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { paramsToFeatureOptions } from "@/internal/billing/v2/compute/computeAutumnUtils/paramsToFeatureOptions";

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
	featureQuantitiesParams: { feature_quantities?: FeatureQuantityParamsV0[] };
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

		if (isLosingPrepaidQuantityPrice({ price, prices: fullProduct.prices }))
			continue;

		const entitlement = priceToEnt({
			price,
			entitlements: fullProduct.entitlements,
			errorOnNotFound: true,
		});

		const newFeatureQuantity = paramsToFeatureOptions({
			params: featureQuantitiesParams,
			price,
			entitlement,
		});

		const currentFeatureQuantity = currentCustomerProduct
			? cusProductToConvertedFeatureOptions({
					cusProduct: currentCustomerProduct,
					entitlement,
					newPrice: price,
				})
			: undefined;

		const featureQuantity = isOneOffPrice(price)
			? newFeatureQuantity
			: (newFeatureQuantity ?? currentFeatureQuantity);

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
