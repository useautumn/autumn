import { CusProductStatus, type FullCusProduct } from "@autumn/shared";

/**
 * Collects all future transition timestamps from customer products.
 * A transition occurs when a product starts or ends, or when
 * trial ends or billing cycle anchor changes.
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

	// Add trial end as a transition point
	if (trialEndsAt && trialEndsAt > nowMs) {
		timestamps.add(trialEndsAt);
	}

	// Add new billing cycle anchor as a transition point
	if (newBillingCycleAnchorMs && newBillingCycleAnchorMs > nowMs) {
		timestamps.add(newBillingCycleAnchorMs);
	}

	for (const customerProduct of customerProducts) {
		if (customerProduct.status !== CusProductStatus.Scheduled) {
			continue;
		}

		const startsAtMs = customerProduct.starts_at;
		const endedAtMs = customerProduct.ended_at;

		// Future start = transition point
		if (startsAtMs > nowMs) {
			timestamps.add(startsAtMs);
		}

		// Future end = transition point
		if (endedAtMs && endedAtMs > nowMs) {
			timestamps.add(endedAtMs);
		}
	}

	return [...Array.from(timestamps).sort((a, b) => a - b), undefined];
};
