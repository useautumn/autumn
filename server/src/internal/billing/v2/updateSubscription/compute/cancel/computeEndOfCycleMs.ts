import { cusProductToPrices, getCycleEnd } from "@autumn/shared";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";
import { getLargestInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils";

/**
 * Calculates the end of cycle timestamp for cancellation.
 * For 'immediately' mode, returns currentEpochMs.
 * For 'end_of_cycle' mode, calculates the next cycle end based on billing interval.
 */
export const computeEndOfCycleMs = ({
	billingContext,
}: {
	billingContext: UpdateSubscriptionBillingContext;
}): number => {
	const { cancelMode, customerProduct, billingCycleAnchorMs, currentEpochMs } =
		billingContext;

	if (cancelMode === "immediately") {
		return currentEpochMs;
	}

	const prices = cusProductToPrices({ cusProduct: customerProduct });
	const largestInterval = getLargestInterval({ prices, excludeOneOff: true });

	if (!largestInterval) {
		// No recurring interval found, default to current time
		return currentEpochMs;
	}

	const anchor =
		billingCycleAnchorMs === "now" ? currentEpochMs : billingCycleAnchorMs;

	return getCycleEnd({
		anchor,
		interval: largestInterval.interval,
		intervalCount: largestInterval.intervalCount,
		now: currentEpochMs,
		floor: anchor,
	});
};
