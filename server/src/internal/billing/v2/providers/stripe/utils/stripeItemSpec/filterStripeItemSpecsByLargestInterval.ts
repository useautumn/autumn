import type { StripeItemSpec } from "@autumn/shared";
import { getLargestInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils";
/**
 * Filters stripe item specs to only include items from the largest billing interval.
 * Used for Stripe Checkout which doesn't support multi-interval subscriptions.
 */
export const filterStripeItemSpecsByLargestInterval = ({
	stripeItemSpecs,
}: {
	stripeItemSpecs: StripeItemSpec[];
}): StripeItemSpec[] => {
	const prices = stripeItemSpecs
		.map((spec) => spec.autumnPrice)
		.filter((p): p is NonNullable<typeof p> => !!p);

	if (prices.length === 0) return stripeItemSpecs;

	const largestInterval = getLargestInterval({ prices, excludeOneOff: true });
	if (!largestInterval) return stripeItemSpecs;

	return stripeItemSpecs.filter((spec) => {
		const price = spec.autumnPrice;
		if (!price) return false;

		const priceInterval = price.config.interval;
		const priceIntervalCount = price.config.interval_count ?? 1;

		return (
			priceInterval === largestInterval.interval &&
			priceIntervalCount === largestInterval.intervalCount
		);
	});
};
