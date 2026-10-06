import {
	type BillingContext,
	type BillingInterval,
	getCycleEnd,
	secondsToMs,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

/**
 * Compute the next cycle start, billing context override, and proration ratio
 * for a scheduled billing cycle anchor reset.
 *
 * When the anchor resets before the current period ends, Stripe charges only
 * the prorated "extra" window that extends beyond the original period end.
 * When it resets at or after the period end, the next invoice is the normal
 * renewal at the original period end with full amount.
 */
export const computeScheduledAnchorResetPreview = ({
	billingContext,
	interval,
	intervalCount,
}: {
	billingContext: BillingContext;
	interval: BillingInterval;
	intervalCount: number;
}): {
	nextCycleStart: number;
	prorationRatio: Decimal | undefined;
	lineItemsBillingContext: BillingContext;
} => {
	const scheduledAnchor = billingContext.requestedBillingCycleAnchor as number;

	const originalAnchorMs = billingContext.stripeSubscription
		?.billing_cycle_anchor
		? secondsToMs(billingContext.stripeSubscription.billing_cycle_anchor)
		: billingContext.currentEpochMs;

	const originalPeriodEnd = getCycleEnd({
		anchor: originalAnchorMs,
		interval,
		intervalCount,
		now: billingContext.currentEpochMs,
	});

	const normalizedScheduledAnchor =
		truncateMsToSecondPrecision(scheduledAnchor);
	const normalizedOriginalPeriodEnd =
		truncateMsToSecondPrecision(originalPeriodEnd);

	if (normalizedScheduledAnchor < normalizedOriginalPeriodEnd) {
		const newCycleEnd = getCycleEnd({
			anchor: scheduledAnchor,
			interval,
			intervalCount,
			now: scheduledAnchor,
		});

		const normalizedNewCycleEnd = truncateMsToSecondPrecision(newCycleEnd);
		const extraWindow = new Decimal(normalizedNewCycleEnd).minus(
			normalizedOriginalPeriodEnd,
		);
		const fullNewCycle = new Decimal(normalizedNewCycleEnd).minus(
			normalizedScheduledAnchor,
		);

		return {
			nextCycleStart: scheduledAnchor,
			prorationRatio: fullNewCycle.isZero()
				? undefined
				: extraWindow.div(fullNewCycle),
			lineItemsBillingContext: billingContext,
		};
	}

	return {
		nextCycleStart: originalPeriodEnd,
		prorationRatio: undefined,
		lineItemsBillingContext: {
			...billingContext,
			billingCycleAnchorMs: originalAnchorMs,
		},
	};
};
