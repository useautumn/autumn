import type { PlanTiming } from "@autumn/shared";
import {
	cusProductToPrices,
	type FullCusProduct,
	getCycleEnd,
	secondsToMs,
} from "@autumn/shared";
import type Stripe from "stripe";
import { getLargestInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils";

/**
 * Computes the end of cycle timestamp for scheduled product attachments.
 * Used for:
 * - Downgrades (transition from existing product)
 * - Merged subscription scheduling (entity joins existing subscription at renewal)
 *
 * Returns undefined if planTiming is "immediate" or no billing cycle can be determined.
 */
export const setupAttachEndOfCycleMs = ({
	planTiming,
	currentCustomerProduct,
	stripeSubscription,
	billingCycleAnchorMs,
	currentEpochMs,
}: {
	planTiming: PlanTiming;
	currentCustomerProduct?: FullCusProduct;
	stripeSubscription?: Stripe.Subscription;
	billingCycleAnchorMs?: number | "now";
	currentEpochMs: number;
}): number | undefined => {
	if (planTiming !== "end_of_cycle") {
		return undefined;
	}

	// Case 1: Transitioning from existing product (upgrade/downgrade)
	if (currentCustomerProduct && billingCycleAnchorMs !== undefined) {
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
	}

	// Case 2: Merged subscription - no existing product but joining existing subscription
	// Use the subscription's current period end as the scheduled start time
	if (stripeSubscription?.current_period_end) {
		return secondsToMs(stripeSubscription.current_period_end);
	}

	return undefined;
};
