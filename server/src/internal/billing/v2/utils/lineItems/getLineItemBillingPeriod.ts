import type { BillingContext } from "@autumn/shared";
import {
	type BillingPeriod,
	getCycleEnd,
	getCycleStart,
	isOneOffPrice,
	type Price,
	secondsToMs,
} from "@autumn/shared";

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

	const {
		billingCycleAnchorMs,
		currentEpochMs,
		stripeSubscription,
		trialContext,
	} = billingContext;

	const { interval, interval_count: intervalCount } = price.config;

	// Floor for start: subscription creation date (can't bill before subscription existed)
	const startFloor = stripeSubscription?.created
		? secondsToMs(stripeSubscription.created)
		: undefined;

	// Floor for end: trial end (can't end billing period before trial ends).
	// Only used for long trials (>1 interval) where the natural cycle end would land
	// before the trial end. For non-trial attaches against an existing subscription
	// whose anchor is far in the future, do NOT floor at the anchor — natural cycle
	// boundaries (e.g., monthly add-on on an annual sub) are correct.
	const trialEndsAt = trialContext?.trialEndsAt;
	const endFloor =
		trialEndsAt && trialEndsAt > currentEpochMs ? trialEndsAt : undefined;

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
