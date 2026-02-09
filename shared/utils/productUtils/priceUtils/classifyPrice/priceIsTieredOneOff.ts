import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import type { UsagePriceConfig } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import type { Price } from "@models/productModels/priceModels/priceModels";
import type { FullProduct } from "@models/productModels/productModels";
import { priceToEnt } from "@utils/productUtils/convertProductUtils";
import { isFixedPrice } from "@utils/productUtils/priceUtils/classifyPriceUtils";

/**
 * Determines if a price is a "tiered one-off" price.
 * A price is tiered one-off if:
 * 1. It's a usage price (not fixed)
 * 2. It's one-off (interval === BillingInterval.OneOff)
 * 3. Either has multiple tiers OR the entitlement has an allowance > 0
 *
 * Stripe doesn't support one-off tiered prices, so we need to calculate
 * the amount inline and create an ad-hoc price_data.
 */
export const priceIsTieredOneOff = ({
	price,
	product,
}: {
	price: Price;
	product: FullProduct;
}): boolean => {
	// Fixed prices can't be tiered
	if (isFixedPrice(price)) return false;

	const config = price.config as UsagePriceConfig;

	// Must be one-off
	if (config.interval !== BillingInterval.OneOff) {
		return false;
	}

	// Has multiple tiers
	if (config.usage_tiers.length > 1) {
		return true;
	}

	// Check if entitlement has allowance (creates implicit free tier)
	const entitlement = priceToEnt({
		price,
		entitlements: product.entitlements,
	});

	if (entitlement?.allowance && entitlement.allowance > 0) {
		return true;
	}

	return false;
};
