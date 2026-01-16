import { CusProductStatus, type FullCusProduct } from "@autumn/shared";

/**
 * Collects all future transition timestamps from customer products.
 * A transition occurs when a product starts or ends, or when
 * trial ends or billing cycle anchor changes.
 *
 * Note: Assumes timestamps are already normalized to second-level precision
 * by the caller (buildStripePhasesUpdate).
 *
 * Returns sorted array of Unix timestamps (in ms), ending with undefined for "infinity".
 */
export const buildTransitionPoints = ({
	customerProducts,
	nowMs = Date.now(),
	trialEndsAt,
	newBillingCycleAnchorMs,
}: {
	customerProducts: FullCusProduct[];
	nowMs?: number;
	trialEndsAt?: number;
	newBillingCycleAnchorMs?: number;
}): (number | undefined)[] => {
	const timestamps = new Set<number>();

	// Add new billing cycle anchor as a transition point
	if (newBillingCycleAnchorMs && newBillingCycleAnchorMs > nowMs) {
		timestamps.add(newBillingCycleAnchorMs);
	}

	for (const customerProduct of customerProducts) {
		const startsAtMs = customerProduct.starts_at;
		const endedAtMs = customerProduct.ended_at;

		// For Scheduled products: future start = transition point
		if (
			customerProduct.status === CusProductStatus.Scheduled &&
			startsAtMs > nowMs
		) {
			timestamps.add(startsAtMs);
		}

		// For both Active and Scheduled: future end = transition point (cancellation)
		if (endedAtMs && endedAtMs > nowMs) {
			timestamps.add(endedAtMs);
		}
	}

	// Add trial end as a transition point only if schedule is required
	// (i.e., there's at least one other transition point)
	if (trialEndsAt && trialEndsAt > nowMs && timestamps.size > 0) {
		timestamps.add(trialEndsAt);
	}

	return [...Array.from(timestamps).sort((a, b) => a - b), undefined];
};
