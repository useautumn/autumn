import {
	customerProductToEffectivePrices,
	type FullCusProduct,
	getCycleEnd,
} from "@autumn/shared";
import { getLargestInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils";

/** Where the row's period would end if its cycle restarted now; null when it has no cycle. */
export const periodEndsAtAfterReset = ({
	customerProduct,
	now,
}: {
	customerProduct: FullCusProduct;
	now: number;
}): number | null => {
	const largestInterval = getLargestInterval({
		prices: customerProductToEffectivePrices({ customerProduct }),
		excludeOneOff: true,
	});
	if (!largestInterval) return null;

	return getCycleEnd({
		anchor: "now",
		interval: largestInterval.interval,
		intervalCount: largestInterval.intervalCount,
		now,
	});
};
