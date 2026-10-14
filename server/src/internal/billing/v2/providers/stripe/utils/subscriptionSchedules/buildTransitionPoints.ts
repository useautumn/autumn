import { CusProductStatus, type FullCusProduct } from "@autumn/shared";

export const buildTransitionPoints = ({
	customerProducts,
	nowMs = Date.now(),
	trialEndsAt,
	newBillingCycleAnchorMs,
}: {
	customerProducts: FullCusProduct[];
	nowMs?: number;
	trialEndsAt?: number;
	newBillingCycleAnchorMs?: number | number[];
}): (number | undefined)[] => {
	const timestamps = new Set<number>();

	const billingCycleAnchorMs = Array.isArray(newBillingCycleAnchorMs)
		? newBillingCycleAnchorMs
		: [newBillingCycleAnchorMs];
	for (const anchorMs of billingCycleAnchorMs) {
		if (anchorMs && anchorMs > nowMs) {
			timestamps.add(anchorMs);
		}
	}

	for (const customerProduct of customerProducts) {
		const startsAtMs = customerProduct.starts_at;
		const endedAtMs = customerProduct.ended_at;

		if (
			customerProduct.status === CusProductStatus.Scheduled &&
			startsAtMs > nowMs
		) {
			timestamps.add(startsAtMs);
		}

		if (endedAtMs && endedAtMs > nowMs) {
			timestamps.add(endedAtMs);
		}
	}

	if (trialEndsAt && trialEndsAt > nowMs && timestamps.size > 0) {
		timestamps.add(trialEndsAt);
	}

	return [...Array.from(timestamps).sort((a, b) => a - b), undefined];
};
