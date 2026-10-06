import {
	type BillingContext,
	type BillingInterval,
	getCycleEnd,
	type PhaseProrationBehavior,
	secondsToMs,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { phaseStartCreditsUnusedTime } from "@/internal/billing/v2/utils/schedulePhaseProration/resolvePhaseStartProrationBehavior";
import type { AnchorResetProration } from "./prorateAnchorResetLineItem";

/** An anchor inside the current period starts the next cycle with per-line proration;
 * one at or past the period end leaves the normal full renewal as the next invoice. */
export const computeScheduledAnchorResetPreview = ({
	billingContext,
	interval,
	intervalCount,
	prorationBehavior,
}: {
	billingContext: BillingContext;
	interval: BillingInterval;
	intervalCount: number;
	prorationBehavior: PhaseProrationBehavior | undefined;
}): {
	nextCycleStart: number;
	anchorResetProration: AnchorResetProration | undefined;
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

	// Without proration Stripe moves the anchor without invoicing, so the
	// first invoice is the new cycle's renewal at the full amount.
	if (!phaseStartCreditsUnusedTime({ prorationBehavior })) {
		return {
			nextCycleStart: getCycleEnd({
				anchor: scheduledAnchor,
				interval,
				intervalCount,
				now: scheduledAnchor,
			}),
			anchorResetProration: undefined,
			lineItemsBillingContext: {
				...billingContext,
				billingCycleAnchorMs: scheduledAnchor,
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
