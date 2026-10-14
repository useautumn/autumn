import type { UpdateSubscriptionBillingContext } from "@autumn/shared";
import { customerProductToEffectivePrices, getCycleEnd } from "@autumn/shared";
import { getLargestInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils";

export const computeEndOfCycleMs = ({
	billingContext,
}: {
	billingContext: UpdateSubscriptionBillingContext;
}): number => {
	const {
		cancelAction,
		customerProduct,
		billingCycleAnchorMs,
		currentEpochMs,
	} = billingContext;

	if (cancelAction === "cancel_immediately") {
		return currentEpochMs;
	}

	const prices = customerProductToEffectivePrices({ customerProduct });
	const largestInterval = getLargestInterval({ prices, excludeOneOff: true });

	if (!largestInterval) {
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
