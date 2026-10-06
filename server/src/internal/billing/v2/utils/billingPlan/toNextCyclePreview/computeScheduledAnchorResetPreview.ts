import {
	type BillingContext,
	type BillingInterval,
	getCycleEnd,
	type PhaseProrationBehavior,
	secondsToMs,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { phaseStartCreditsUnusedTime } from "@/internal/billing/v2/utils/schedulePhaseProration/resolvePhaseStartProrationBehavior";

/**
 * Compute the next cycle start, billing context override, and proration ratio
 * for a scheduled billing cycle anchor reset.
 *
 * When the anchor resets before the current period ends, Stripe charges only
 * the prorated "extra" window that extends beyond the original period end.
 * With proration_behavior none, Stripe invoices nothing at the anchor. When it
 * resets at or after the period end, the next invoice is the normal renewal at
 * the original period end with full amount.
 */
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

		// Without proration Stripe moves the anchor without invoicing, so the
		// first invoice is the new cycle's renewal at the full amount.
		if (!phaseStartCreditsUnusedTime({ prorationBehavior })) {
			return {
				nextCycleStart: newCycleEnd,
				prorationRatio: undefined,
				lineItemsBillingContext: {
					...billingContext,
					billingCycleAnchorMs: scheduledAnchor,
				},
			};
		}

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
