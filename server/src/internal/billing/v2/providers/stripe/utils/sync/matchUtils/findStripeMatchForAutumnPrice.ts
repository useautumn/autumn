import {
	type FixedPriceConfig,
	isFixedPrice,
	type Price,
	type Product,
	type UsagePriceConfig,
} from "@autumn/shared";
import { getStripePriceIdsForAutumnPrice } from "./getStripePriceIdsForAutumnPrice";
import type { PriceMatchCondition } from "./matchConditions";

/**
 * Returns the Stripe product id that this Autumn price is *natively* keyed
 * to (for prepaid/usage prices that store `stripe_product_id` on their
 * config). Fixed prices intentionally return null — they are matched
 * exclusively via `stripe_price_id` at priority 1; any other Stripe price
 * under the same Stripe product should fall through to the priority-3
 * product-level match so the rollup can flag it as a custom base.
 */
const stripeProductIdForAutumnPrice = ({
	price,
}: {
	price: Price;
}): string | null => {
	if (isFixedPrice(price)) return null;
	const config = price.config as FixedPriceConfig | UsagePriceConfig;
	return config.stripe_product_id ?? null;
};

/**
 * Find the highest-priority match condition between an Autumn price and a
 * pool of Stripe ids (typically collected from a subscription's items).
 *
 * Priority:
 *   1. stripe_price_id   (exact price match)
 *   2. stripe_product_id (prepaid/usage price explicitly keyed by product)
 *
 * Returns null when neither id type intersects.
 */
export const findStripeMatchForAutumnPrice = ({
	price,
	stripePriceIds,
	stripeProductIds,
}: {
	price: Price;
	product: Product;
	stripePriceIds: Set<string>;
	stripeProductIds: Set<string>;
}): PriceMatchCondition | null => {
	const matchedPriceId = getStripePriceIdsForAutumnPrice({ price }).find((id) =>
		stripePriceIds.has(id),
	);
	if (matchedPriceId) {
		return { type: "stripe_price_id", stripe_price_id: matchedPriceId };
	}

	const stripeProductId = stripeProductIdForAutumnPrice({ price });
	if (stripeProductId && stripeProductIds.has(stripeProductId)) {
		return {
			type: "stripe_product_id",
			stripe_product_id: stripeProductId,
		};
	}

	return null;
};
