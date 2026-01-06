import {
	type FeatureOptions,
	type FullCusProduct,
	type FullCustomerPrice,
	findCusPriceByFeature,
	InternalError,
	type Price,
	type UsagePriceConfig,
} from "@autumn/shared";

/**
 * Extracts and validates price configuration for a quantity update.
 *
 * Finds the customer price and extracts billing units per quantity.
 *
 * @param updatedOptions - New feature options with target quantity
 * @param customerProduct - Customer product with associated prices
 * @returns Price config including billing units
 * @throws {InternalError} When internal_feature_id is missing or price not found
 */
export const resolvePriceForQuantityUpdate = ({
	customerProduct,
	updatedOptions,
}: {
	customerProduct: FullCusProduct;
	updatedOptions: FeatureOptions;
}): {
	customerPrice: FullCustomerPrice;
	price: Price;
	priceConfig: UsagePriceConfig;
	billingUnitsPerQuantity: number;
} => {
	if (!updatedOptions.internal_feature_id) {
		throw new InternalError({
			message: `[Quantity Update] Missing internal_feature_id for feature: ${updatedOptions.feature_id}`,
		});
	}

	const customerPrice = findCusPriceByFeature({
		internalFeatureId: updatedOptions.internal_feature_id,
		cusPrices: customerProduct.customer_prices,
	});

	if (!customerPrice) {
		throw new InternalError({
			message: `[Quantity Update] Customer price not found for internal_feature_id: ${updatedOptions.internal_feature_id}`,
		});
	}

	const price = customerPrice.price;
	const priceConfig = price.config as UsagePriceConfig;
	const billingUnitsPerQuantity = priceConfig.billing_units ?? 1;

	return {
		customerPrice,
		price,
		priceConfig,
		billingUnitsPerQuantity,
	};
};
