import {
	type FeatureOptions,
	type FullCusProduct,
	type FullCustomerPrice,
	findCusPriceByFeature,
	InternalError,
	type OnDecrease,
	type OnIncrease,
	type Price,
	priceToProrationConfig,
	type UsagePriceConfig,
} from "@autumn/shared";

/**
 * Extracts and validates price configuration for a quantity update.
 *
 * Determines proration behavior (on_increase/on_decrease) based on quantity change direction.
 *
 * @param updatedOptions - New feature options with target quantity
 * @param customerProduct - Customer product with associated prices
 * @param previousOptions - Current feature options
 * @returns Price config including proration rules and billing units
 * @throws {InternalError} When internal_feature_id is missing or price not found
 */
export const resolvePriceForQuantityUpdate = ({
	customerProduct,
	updatedOptions,
	isUpgrade,
}: {
	customerProduct: FullCusProduct;
	updatedOptions: FeatureOptions;
	isUpgrade: boolean;
}): {
	customerPrice: FullCustomerPrice;
	price: Price;
	priceConfig: UsagePriceConfig;
	billingUnitsPerQuantity: number;
	prorationBehaviorConfig: OnIncrease | OnDecrease;
	shouldApplyProration: boolean;
	shouldFinalizeInvoiceImmediately: boolean;
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

	const {
		prorationBehaviorConfig,
		shouldApplyProration,
		shouldFinalizeInvoiceImmediately,
	} = priceToProrationConfig({
		price,
		isUpgrade,
	});

	return {
		customerPrice,
		price,
		priceConfig,
		billingUnitsPerQuantity,
		prorationBehaviorConfig,
		shouldApplyProration,
		shouldFinalizeInvoiceImmediately,
	};
};
