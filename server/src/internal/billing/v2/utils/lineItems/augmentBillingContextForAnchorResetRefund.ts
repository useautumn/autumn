import {
	type AnchorResetRefund,
	type BillingPeriod,
	getCycleEnd,
	getCycleStart,
} from "@autumn/shared";

export type AnchorResetRefundAction =
	| { type: "skip" }
	| { type: "use_snapped_now"; snappedNow: number }
	| { type: "no_adjustment" };

/**
 * Determines how to adjust a refund line item's `now` for full-period-only refunds.
 *
 * Snaps `now` forward to the next entitlement cycle boundary so that only
 * complete reset periods are credited. Returns a discriminated union:
 * - "no_adjustment": anchorResetRefund not active, use original now
 * - "skip": no refundCycle or 0 full periods remaining, skip this refund item
 * - "use_snapped_now": use the returned snappedNow for proration/effectivePeriod
 */
export const augmentBillingContextForAnchorResetRefund = ({
	currentEpochMs,
	billingPeriod,
	anchorResetRefund,
}: {
	currentEpochMs: number;
	billingPeriod: BillingPeriod;
	anchorResetRefund?: AnchorResetRefund;
}): AnchorResetRefundAction => {
	if (!anchorResetRefund?.noPartialRefund) return { type: "no_adjustment" };

	const { refundCycle } = anchorResetRefund;
	if (!refundCycle) return { type: "skip" };

	const cycleStart = getCycleStart({
		anchor: billingPeriod.start,
		interval: refundCycle.interval,
		intervalCount: refundCycle.intervalCount,
		now: currentEpochMs,
	});

	// If now lands exactly on a cycle boundary, use it directly.
	// Otherwise getCycleEnd returns the next boundary (overshooting by one period).
	const snappedNow =
		cycleStart === currentEpochMs
			? currentEpochMs
			: getCycleEnd({
					anchor: billingPeriod.start,
					interval: refundCycle.interval,
					intervalCount: refundCycle.intervalCount,
					now: currentEpochMs,
				});

	if (snappedNow >= billingPeriod.end) return { type: "skip" };

	return { type: "use_snapped_now", snappedNow };
};
