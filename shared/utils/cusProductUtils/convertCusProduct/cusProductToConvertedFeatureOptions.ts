import type {
	FeatureOptions,
	FullCusProduct,
} from "@models/cusProductModels/cusProductModels";
import type { Feature } from "@models/featureModels/featureModels";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { roundUsageToNearestBillingUnit } from "@utils/billingUtils/usageUtils/roundUsageToNearestBillingUnit";
import { findPrepaidCusPriceByFeature } from "@utils/cusPriceUtils/findCusPriceUtils/findPrepaidCusPriceByFeature";
import { Decimal } from "decimal.js";
import { cusProductToFeatureOptions } from "./cusProductToFeatureOptions";

/**
 * Get the feature options from a customer product, converted to new price billing units
 */
export const cusProductToConvertedFeatureOptions = ({
	cusProduct,
	feature,
	newPrice,
}: {
	cusProduct: FullCusProduct;
	feature: Feature;
	newPrice: Price;
}): FeatureOptions | undefined => {
	const currentOption = cusProductToFeatureOptions({ cusProduct, feature });

	if (!currentOption?.quantity) return undefined;

	const oldCusPrice = findPrepaidCusPriceByFeature({
		customerPrices: cusProduct.customer_prices,
		feature,
	});

	// If no old price found, we can't interpret the stored quantity
	if (!oldCusPrice) return undefined;

	const oldBillingUnits = oldCusPrice.price.config.billing_units ?? 1;
	const newBillingUnits = newPrice.config.billing_units ?? 1;

	// 1. Multiply by old billing units to get actual quantity
	const actualQuantity = new Decimal(currentOption.quantity)
		.mul(oldBillingUnits)
		.toNumber();

	// 2. Round to nearest new billing unit
	const roundedQuantity = roundUsageToNearestBillingUnit({
		usage: actualQuantity,
		billingUnits: newBillingUnits,
	});

	// 3. Divide by new billing units
	const convertedQuantity = new Decimal(roundedQuantity)
		.div(newBillingUnits)
		.toNumber();

	return {
		internal_feature_id: feature.internal_id,
		feature_id: feature.id,
		quantity: convertedQuantity,
	};
};
