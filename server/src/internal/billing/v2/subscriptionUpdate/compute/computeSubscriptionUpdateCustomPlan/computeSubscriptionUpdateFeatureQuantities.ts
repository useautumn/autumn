import {
	cusProductToConvertedFeatureOptions,
	type FeatureOptions,
	type FullCusProduct,
	type FullProduct,
	InternalError,
	isPrepaidPrice,
	priceToFeature,
	type SubscriptionUpdateV0Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { paramsToFeatureOptions } from "@/internal/billing/v2/compute/computeAutumnUtils/paramsToFeatureOptions";

/**
 * Compute the feature quantities for a subscription update
 */
export const computeSubscriptionUpdateFeatureQuantities = ({
	ctx,
	fullProduct,
	currentCustomerProduct,
	params,
}: {
	ctx: AutumnContext;
	fullProduct: FullProduct;
	currentCustomerProduct: FullCusProduct;
	params: SubscriptionUpdateV0Params;
}) => {
	const newFeatureQuantities: FeatureOptions[] = [];
	for (const price of fullProduct.prices) {
		if (!isPrepaidPrice(price)) continue;

		const feature = priceToFeature({
			price,
			features: ctx.features,
		});

		if (!feature)
			throw new InternalError({
				message: `computing feature quantities for price ${price.id} but no feature found`,
			});

		const newFeatureQuantity = paramsToFeatureOptions({
			params,
			price,
			feature,
		});

		// Convert current quantity from old price's billing units to new price's billing units
		const currentFeatureQuantity = cusProductToConvertedFeatureOptions({
			cusProduct: currentCustomerProduct,
			feature,
			newPrice: price,
		});

		const featureQuantity = newFeatureQuantity ?? currentFeatureQuantity;

		if (featureQuantity) newFeatureQuantities.push(featureQuantity);
	}

	return newFeatureQuantities;
};
