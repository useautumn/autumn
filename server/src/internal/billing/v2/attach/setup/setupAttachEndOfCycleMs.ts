import {
	cusProductToPrices,
	type FullCusProduct,
	getCycleEnd,
	type PlanTiming,
} from "@autumn/shared";
import type Stripe from "stripe";
import { getEarliestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils";
import { getLargestInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils";

/**
 * Computes the end of cycle timestamp for downgrades.
 * Returns undefined if planTiming is "immediate" or no billing interval found.
 */
export const setupAttachEndOfCycleMs = ({
	planTiming,
	currentCustomerProduct,
	stripeSubscription,
	currentEpochMs,
}: {
	planTiming: PlanTiming;
	currentCustomerProduct?: FullCusProduct;
	stripeSubscription?: Stripe.Subscription;
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

	// Use Stripe subscription's earliest period end if available
	const billingAnchor = stripeSubscription
		? getEarliestPeriodEnd({ sub: stripeSubscription }) * 1000
		: currentEpochMs;

	return getCycleEnd({
		anchor: billingAnchor,
		interval: largestInterval.interval,
		intervalCount: largestInterval.intervalCount,
		now: currentEpochMs,
		floor: billingAnchor,
	});
};
