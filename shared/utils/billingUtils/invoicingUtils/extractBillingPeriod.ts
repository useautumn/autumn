import { InternalError } from "@api/errors/base/InternalError";
import type { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { secondsToMs } from "@utils/common/unixUtils";
import type Stripe from "stripe";
import { getCycleEnd } from "../cycleUtils/getCycleEnd";
import { getCycleStart } from "../cycleUtils/getCycleStart";

/**
 * Calculates the current billing period for a subscription.
 *
 * Uses the subscription's billing_cycle_anchor and the price's interval configuration
 * to calculate the billing period in-house, rather than relying on Stripe subscription
 * item periods.
 *
 * @param stripeSubscription - Stripe subscription object (for billing_cycle_anchor)
 * @param interval - The billing interval from the price config
 * @param intervalCount - Number of intervals per cycle (default: 1)
 * @param currentEpochMs - Current timestamp in milliseconds
 * @returns Start and end timestamps in milliseconds
 */
export const extractBillingPeriod = ({
	stripeSubscription,
	interval,
	intervalCount = 1,
	currentEpochMs,
}: {
	stripeSubscription: Stripe.Subscription;
	interval: BillingInterval;
	intervalCount?: number;
	currentEpochMs: number;
}): {
	subscriptionPeriodStartEpochMs: number;
	subscriptionPeriodEndEpochMs: number;
} => {
	const billingCycleAnchorMs = secondsToMs(
		stripeSubscription.billing_cycle_anchor,
	);

	if (!billingCycleAnchorMs) {
		throw new InternalError({
			message: `[Billing] Invalid billing_cycle_anchor: ${stripeSubscription.billing_cycle_anchor}`,
		});
	}

	const subscriptionPeriodStartEpochMs = getCycleStart({
		anchor: billingCycleAnchorMs,
		interval,
		intervalCount,
		now: currentEpochMs,
	});

	const subscriptionPeriodEndEpochMs = getCycleEnd({
		anchor: billingCycleAnchorMs,
		interval,
		intervalCount,
		now: currentEpochMs,
	});

	return {
		subscriptionPeriodStartEpochMs,
		subscriptionPeriodEndEpochMs,
	};
};
