import type { PlanTiming } from "@autumn/shared";
import {
	cusProductToPrices,
	type FullCusProduct,
	getCycleEnd,
} from "@autumn/shared";
import type Stripe from "stripe";
import { getLargestInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils";

/**
 * Computes the end of cycle timestamp for downgrades.
 * Returns undefined if planTiming is "immediate" or no billing interval found.
 */
export const setupAttachEndOfCycleMs = ({
	planTiming,
	currentCustomerProduct,
	billingCycleAnchorMs,
	currentEpochMs,
}: {
	planTiming: PlanTiming;
	currentCustomerProduct?: FullCusProduct;
	stripeSubscription?: Stripe.Subscription;
	billingCycleAnchorMs: number | "now";
	currentEpochMs: number;
}): number | undefined => {
	if (planTiming !== "end_of_cycle" || !currentCustomerProduct) {
		return undefined;
	}

	const currentPrices = cusProductToPrices({
		cusProduct: currentCustomerProduct,
	});

	const largestInterval = getLargestInterval({
		prices: currentPrices,
		excludeOneOff: true,
	});

	if (!largestInterval) {
		return undefined;
	}

	return getCycleEnd({
		anchor: billingCycleAnchorMs,
		interval: largestInterval.interval,
		intervalCount: largestInterval.intervalCount,
		now: currentEpochMs,
		floor: billingCycleAnchorMs === "now" ? undefined : billingCycleAnchorMs,
	});
};
