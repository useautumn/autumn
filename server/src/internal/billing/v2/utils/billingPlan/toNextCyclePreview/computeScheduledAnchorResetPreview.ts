import {
	type BillingContext,
	type BillingInterval,
	getCycleEnd,
	secondsToMs,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import type { AnchorResetProration } from "./prorateAnchorResetLineItem";

/** An anchor inside the current period starts the next cycle with per-line proration;
 * one at or past the period end leaves the normal full renewal as the next invoice. */
export const computeScheduledAnchorResetPreview = ({
	billingContext,
	scheduledAnchor,
	interval,
	intervalCount,
}: {
	billingContext: BillingContext;
	/** The reset event's own anchor: requested now, or already pending on the subscription. */
	scheduledAnchor: number;
	interval: BillingInterval;
	intervalCount: number;
}): {
	nextCycleStart: number;
	anchorResetProration: AnchorResetProration | undefined;
	lineItemsBillingContext: BillingContext;
} => {
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

	const resetsBeforePeriodEnd =
		truncateMsToSecondPrecision(scheduledAnchor) <
		truncateMsToSecondPrecision(originalPeriodEnd);

	if (!resetsBeforePeriodEnd) {
		return {
			nextCycleStart: originalPeriodEnd,
			anchorResetProration: undefined,
			lineItemsBillingContext: {
				...billingContext,
				billingCycleAnchorMs: originalAnchorMs,
			},
		};
	}

	return {
		nextCycleStart: scheduledAnchor,
		anchorResetProration: {
			originalAnchorMs,
			currentEpochMs: billingContext.currentEpochMs,
		},
		lineItemsBillingContext: billingContext,
	};
};
