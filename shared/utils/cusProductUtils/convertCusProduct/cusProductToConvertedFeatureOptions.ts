import type {
	FeatureOptions,
	FullCusProduct,
} from "@models/cusProductModels/cusProductModels";
import type { EntitlementWithFeature } from "@models/productModels/entModels/entModels";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { roundUsageToNearestBillingUnit } from "@utils/billingUtils/usageUtils/roundUsageToNearestBillingUnit";
import { findPrepaidCusPriceByFeature } from "@utils/cusPriceUtils/findCusPriceUtils/findPrepaidCusPriceByFeature";
import { nullish } from "@utils/utils";
import { Decimal } from "decimal.js";
import { cusProductToFeatureOptions } from "./cusProductToFeatureOptions";

/**
 * Converts purchased packs from an old customer product to packs in new billing units.
 * Allowance (included usage) is NOT factored in here — it's handled by getStartingBalance.
 */
export const cusProductToConvertedFeatureOptions = ({
	cusProduct,
	entitlement,
	newPrice,
}: {
	cusProduct: FullCusProduct;
	entitlement: EntitlementWithFeature;
	newPrice: Price;
}): FeatureOptions | undefined => {
	const feature = entitlement.feature;
	const currentOption = cusProductToFeatureOptions({ cusProduct, feature });

	if (nullish(currentOption?.quantity)) return undefined;

	const oldCusPrice = findPrepaidCusPriceByFeature({
		customerPrices: cusProduct.customer_prices,
		feature,
	});

	// If no old price found, we can't interpret the stored quantity
	if (!oldCusPrice) return undefined;

	const oldBillingUnits = oldCusPrice.price.config.billing_units ?? 1;
	const newBillingUnits = newPrice.config.billing_units ?? 1;

	// 1. Multiply by old billing units to get actual purchased quantity
	const actualQuantity = new Decimal(currentOption.quantity)
		.mul(oldBillingUnits)
		.toNumber();

	// 2. Round to nearest new billing unit
	const roundedQuantity = roundUsageToNearestBillingUnit({
		usage: actualQuantity,
		billingUnits: newBillingUnits,
	});

	// 3. Divide by new billing units to get packs
	const convertedQuantity = new Decimal(roundedQuantity)
		.div(newBillingUnits)
		.toNumber();

	const finalQuantity = Math.max(0, convertedQuantity);

	return {
		internal_feature_id: feature.internal_id,
		feature_id: feature.id,
		quantity: finalQuantity,
	};
};
