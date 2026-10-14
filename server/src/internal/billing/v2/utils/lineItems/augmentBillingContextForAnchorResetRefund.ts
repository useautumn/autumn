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
