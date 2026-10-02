import { isFixedPrice, type Price, type UsagePriceConfig } from "@autumn/shared";

/** Donor feature Product — skip fixed; plan processor is a different object. */
export const copyReusableStripeProductId = ({
	targetPrice,
	sourcePrice,
}: {
	targetPrice: Price;
	sourcePrice: Price;
}): boolean => {
	if (isFixedPrice(targetPrice) || isFixedPrice(sourcePrice)) return false;

	const target = targetPrice.config as UsagePriceConfig;
	const source = sourcePrice.config as UsagePriceConfig;
	if (target.stripe_product_id || !source.stripe_product_id) return false;

	target.stripe_product_id = source.stripe_product_id;
	return true;
};
