import {
	type BillingPeriod,
	getCycleEnd,
	getCycleStart,
	isOneOffPrice,
	type Price,
	secondsToMs,
} from "@autumn/shared";
import type { BillingContext } from "@/internal/billing/v2/types";

/**
 * Calculates the billing period (start and end) for a line item based on the billing context.
 *
 * Uses floor constraints to ensure:
 * - Period start is not before the Stripe subscription creation date
 * - Period end is not before the billing cycle anchor (e.g., trial end date)
 *
 * @param billingContext - The billing context containing anchors and timestamps
 * @param price - The price to calculate the billing period for
 * @returns BillingPeriod with start/end timestamps, or undefined for one-off prices
 */
export const getLineItemBillingPeriod = ({
	billingContext,
	price,
}: {
	billingContext: BillingContext;
	price: Price;
}): BillingPeriod | undefined => {
	if (isOneOffPrice(price)) return undefined;

	const { billingCycleAnchorMs, currentEpochMs, stripeSubscription } =
		billingContext;

	const { interval, interval_count: intervalCount } = price.config;

	// Floor for start: subscription creation date (can't bill before subscription existed)
	const startFloor = stripeSubscription?.created
		? secondsToMs(stripeSubscription.created)
		: undefined;

	// Floor for end: billing cycle anchor (can't end billing period before anchor, e.g., trial end)
	// Only apply when anchor is a specific timestamp, not "now"
	const endFloor =
		billingCycleAnchorMs === "now" ? undefined : billingCycleAnchorMs;

	const start = getCycleStart({
		anchor: billingCycleAnchorMs,
		interval,
		intervalCount,
		now: currentEpochMs,
		floor: startFloor,
	});

	const end = getCycleEnd({
		anchor: billingCycleAnchorMs,
		interval,
		intervalCount,
		now: currentEpochMs,
		floor: endFloor,
	});

	return { start, end };
};
