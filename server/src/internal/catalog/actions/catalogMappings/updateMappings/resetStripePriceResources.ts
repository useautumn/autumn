import { isFixedPrice, type Price } from "@autumn/shared";
import { clearDependentStripePriceFields } from "../catalogMappingUtils.js";
import type { PriceTarget } from "./updateMappingUtils.js";

export const shouldResetStripePriceResources = ({
	price,
	target,
}: {
	price: Price;
	target: PriceTarget;
}) => {
	const currentStripeProductId = price.config.stripe_product_id ?? null;

	if (currentStripeProductId !== target.stripeProductId) return true;
	if (target.resetStripeResources && isFixedPrice(price)) return true;

	return false;
};

export const resetStripePriceResources = ({
	price,
	target,
	stripePriceId,
}: {
	price: Price;
	target: PriceTarget;
	stripePriceId?: string | null;
}) =>
	clearDependentStripePriceFields({
		price,
		stripeProductId: target.stripeProductId,
		stripePriceId,
	});
