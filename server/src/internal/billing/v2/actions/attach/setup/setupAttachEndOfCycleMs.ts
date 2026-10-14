import type { PlanTiming } from "@autumn/shared";
import {
	cusProductToPrices,
	type FullCusProduct,
	getCycleEnd,
	secondsToMs,
} from "@autumn/shared";
import type Stripe from "stripe";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils";
import { getLargestInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils";

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

	if (currentCustomerProduct && billingCycleAnchorMs !== undefined) {
		const currentPrices = cusProductToPrices({
			cusProduct: currentCustomerProduct,
		});

		const largestInterval = getLargestInterval({
			prices: currentPrices,
			excludeOneOff: true,
		});

		if (largestInterval) {
			return getCycleEnd({
				anchor: billingCycleAnchorMs,
				interval: largestInterval.interval,
				intervalCount: largestInterval.intervalCount,
				now: currentEpochMs,
				floor:
					billingCycleAnchorMs === "now" ? undefined : billingCycleAnchorMs,
			});
		}
	}

	const latestPeriodEndSeconds = getLatestPeriodEnd({
		sub: stripeSubscription,
		subItems: stripeSubscription?.items.data,
	});
	const latestPeriodEndMs = latestPeriodEndSeconds
		? secondsToMs(latestPeriodEndSeconds)
		: undefined;
	if (latestPeriodEndMs) {
		return latestPeriodEndMs;
	}

	return undefined;
};
