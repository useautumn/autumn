import type { FullCusProduct } from "@autumn/shared";

/**
 * Checks if a customer product is active at a given timestamp.
 * Active means: started before/at the timestamp AND not ended before the timestamp
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
	const startsAt = customerProduct.starts_at;
	const endedAt = customerProduct.ended_at;

	// Product is active during period if there's any overlap:
	// 1. Product starts before period ends
	// 2. Product ends after period starts (or never ends)
	const startsBeforePeriodEnds = endMs ? startsAt < endMs : true;
	const endsAfterPeriodStarts = endedAt ? endedAt > startMs : true;

	return startsBeforePeriodEnds && endsAfterPeriodStarts;
};
