import type { FullCusProduct } from "@autumn/shared";

/**
 * Checks if a customer product is active during a given period.
 * Active means: started before period ends AND not ended before/at period starts.
 *
 * Note: Assumes timestamps are already normalized to second-level precision
 * by the caller (buildStripePhasesUpdate).
 */
export const isCustomerProductActiveDuringPeriod = ({
	customerProduct,
	startMs,
	endMs,
}: {
	customerProduct: FullCusProduct;
	startMs: number;
	endMs: number | undefined;
}): boolean => {
	const productStartsAt = customerProduct.starts_at;
	const productEndedAt = customerProduct.ended_at;

	// Product is active during period if there's any overlap:
	// 1. Product starts before period ends
	// 2. Product ends after period starts (or never ends)
	const startsBeforePeriodEnds = endMs ? productStartsAt < endMs : true;
	const endsAfterPeriodStarts = productEndedAt
		? productEndedAt > startMs
		: true;

	return startsBeforePeriodEnds && endsAfterPeriodStarts;
};
